const bcrypt = require("bcryptjs");
const { notifyAdminUserCreated } = require("../notifications/adminUserNotificationService");

const ALLOWED_STUDENT_STATUSES = ["active", "inactive", "cancelled"];

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

/**
 * Lista alunos cadastrados, com total de matrículas e nomes dos
 * cursos associados. courseId/classId filtram por matrícula (EXISTS
 * separado da junção usada para agregar "courses" -- assim a coluna
 * de cursos continua mostrando TODOS os cursos do aluno, não só o
 * curso do filtro). status filtra por students.status (o status do
 * cadastro do aluno, não da matrícula).
 */
async function listStudents(db, filters = {}) {
  const { courseId, classId, status } = filters;

  const conditions = [];
  const params = [];

  const normalizedCourseId = courseId ? Number(courseId) : null;
  const normalizedClassId = classId ? Number(classId) : null;

  if (courseId && (!Number.isInteger(normalizedCourseId) || normalizedCourseId <= 0)) {
    throw createServiceError("Curso inválido.", 400);
  }

  if (classId && (!Number.isInteger(normalizedClassId) || normalizedClassId <= 0)) {
    throw createServiceError("Turma inválida.", 400);
  }

  if (normalizedCourseId) {
    conditions.push(
      "EXISTS (SELECT 1 FROM enrollments ec WHERE ec.student_id = s.id AND ec.course_id = ?)"
    );
    params.push(normalizedCourseId);
  }

  if (normalizedClassId) {
    conditions.push(
      "EXISTS (SELECT 1 FROM enrollments ecl WHERE ecl.student_id = s.id AND ecl.class_id = ?)"
    );
    params.push(normalizedClassId);
  }

  if (status) {
    if (!ALLOWED_STUDENT_STATUSES.includes(status)) {
      throw createServiceError("Status do aluno inválido.", 400);
    }

    conditions.push("s.status = ?");
    params.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [students] = await db.promise().query(
    `
      SELECT
        s.id, s.user_id, s.registration_number, s.birth_date, s.cpf,
        s.phone, s.address, s.status,
        u.name, u.email, u.gender, u.status AS user_status,
        COUNT(DISTINCT e.id) AS total_enrollments,
        GROUP_CONCAT(DISTINCT c.name ORDER BY c.name ASC SEPARATOR ', ') AS courses
      FROM students s
      INNER JOIN users u ON u.id = s.user_id
      LEFT JOIN enrollments e ON e.student_id = s.id
      LEFT JOIN courses c ON c.id = e.course_id
      ${whereClause}
      GROUP BY
        s.id, s.user_id, s.registration_number, s.birth_date, s.cpf,
        s.phone, s.address, s.status, u.name, u.email, u.gender, u.status
      ORDER BY u.name ASC
    `,
    params
  );

  return students.map((student) => ({
    ...student,
    total_enrollments: Number(student.total_enrollments || 0),
  }));
}

/**
 * Busca os dados completos de um aluno pelo ID.
 */
async function getStudentById(db, id) {
  const normalizedStudentId = Number(id);

  if (!Number.isInteger(normalizedStudentId) || normalizedStudentId <= 0) {
    throw createServiceError("ID do aluno inválido.", 400);
  }

  const [studentRows] = await db.promise().query(
    `
      SELECT
        s.id, s.user_id, s.registration_number, s.birth_date, s.cpf,
        s.phone, s.address, s.status AS student_status,
        u.name, u.email, u.gender, u.status AS user_status
      FROM students s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.id = ?
      LIMIT 1
    `,
    [normalizedStudentId]
  );

  if (studentRows.length === 0) {
    throw createServiceError("Aluno não encontrado.", 404);
  }

  // Mantém status como propriedade principal para compatibilidade com
  // formulários administrativos; student_status/user_status continuam
  // disponíveis para diagnóstico.
  return { ...studentRows[0], status: studentRows[0].student_status };
}

/**
 * Cadastra um novo aluno: cria o usuário de autenticação e o
 * perfil acadêmico em uma única transação.
 *
 * `options.connection` permite rodar dentro de uma transação já
 * aberta pelo chamador (ex: createStudentContractWithInitialInvoice)
 * -- quando presente, esta função nunca chama
 * beginTransaction/commit/rollback/release, o chamador é dono da
 * transação.
 *
 * `options.allowNullPassword` cobre o fluxo de contratação
 * administrativa: um aluno novo criado ali nasce sem senha
 * (password_hash NULL) e com users.status = 'pending_activation' --
 * nunca uma senha gerada/enviada por e-mail. O status do aluno em si
 * (students.status) continua o normal ('active'), só o acesso à
 * conta fica pendente até a ativação (ver accountActivationService).
 */
async function createStudent(db, payload, options = {}) {
  const { connection: externalConnection, allowNullPassword = false, actorUserId = null } = options;

  const { name, email, password, gender, birth_date, cpf, phone, address, status } =
    payload;

  if (!name?.trim() || !email?.trim()) {
    throw createServiceError("Nome e e-mail são obrigatórios.", 400);
  }

  const usingNullPassword = allowNullPassword && !password;

  if (!usingNullPassword && !password) {
    throw createServiceError("Nome, e-mail e senha são obrigatórios.", 400);
  }

  if (!birth_date || !cpf?.trim()) {
    throw createServiceError(
      "Data de nascimento e CPF são obrigatórios.",
      400
    );
  }

  const normalizedStudentStatus = status || "active";

  if (!ALLOWED_STUDENT_STATUSES.includes(normalizedStudentStatus)) {
    throw createServiceError("Status do aluno inválido.", 400);
  }

  // O usuário de autenticação normalmente só possui active/inactive;
  // pending_activation é exclusivo do fluxo sem senha.
  const normalizedUserStatus = usingNullPassword
    ? "pending_activation"
    : normalizedStudentStatus === "active"
      ? "active"
      : "inactive";

  const ownsConnection = !externalConnection;
  const connection = externalConnection || (await db.promise().getConnection());

  try {
    if (ownsConnection) {
      await connection.beginTransaction();
    }

    const [existingUserRows] = await connection.query(
      `SELECT id FROM users WHERE email = ? LIMIT 1`,
      [email.trim()]
    );

    if (existingUserRows.length > 0) {
      throw createServiceError("Este e-mail já está cadastrado.", 409);
    }

    const passwordHash = usingNullPassword ? null : await bcrypt.hash(password, 10);

    const [userResult] = await connection.query(
      `
        INSERT INTO users
          (name, email, password_hash, gender, role, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'student', ?, NOW(), NOW())
      `,
      [name.trim(), email.trim(), passwordHash, gender || null, normalizedUserStatus]
    );

    const userId = userResult.insertId;
    const registrationNumber = `STU${String(userId).padStart(5, "0")}`;

    const [studentResult] = await connection.query(
      `
        INSERT INTO students
          (user_id, name, email, gender, registration_number, birth_date, cpf,
           phone, address, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        userId,
        name.trim(),
        email.trim(),
        gender || null,
        registrationNumber,
        birth_date,
        cpf.trim(),
        phone?.trim() || null,
        address?.trim() || null,
        normalizedStudentStatus,
      ]
    );

    if (ownsConnection) {
      await connection.commit();
    }

    // Só notifica quando esta chamada é dona da própria transação
    // (cadastro direto pelo admin, via rota) -- quando embutida numa
    // transação maior (allowNullPassword, usado tanto pelo stub de
    // checkout quanto pela criação de aluno novo dentro de bolsa/
    // migração), quem decide se/quando notificar é o chamador, depois
    // do PRÓPRIO commit dele, nunca esta função (ela não é dona do
    // commit nesse caso). O stub de checkout deliberadamente nunca
    // notifica -- ver eventDefinitions/adminUserCreated.js.
    if (ownsConnection && !usingNullPassword) {
      await notifyAdminUserCreated(db, {
        userId,
        userName: name.trim(),
        userRole: "student",
        origin: "admin",
        actorUserId,
      });
    }

    return {
      id: studentResult.insertId,
      user_id: userId,
      name: name.trim(),
      email: email.trim(),
      registration_number: registrationNumber,
      status: normalizedStudentStatus,
      user_status: normalizedUserStatus,
    };
  } catch (error) {
    if (ownsConnection) {
      await connection.rollback();
    }

    if (error.code === "ER_DUP_ENTRY") {
      throw createServiceError(
        "Já existe um cadastro utilizando estes dados.",
        409
      );
    }

    throw error;
  } finally {
    if (ownsConnection) {
      connection.release();
    }
  }
}

/**
 * Atualiza os dados acadêmicos e de autenticação de um aluno. A
 * senha só é alterada quando uma nova senha é informada.
 */
async function updateStudent(db, id, payload) {
  const normalizedStudentId = Number(id);

  if (!Number.isInteger(normalizedStudentId) || normalizedStudentId <= 0) {
    throw createServiceError("ID do aluno inválido.", 400);
  }

  const { name, email, password, gender, birth_date, cpf, phone, address, status } =
    payload;

  if (!name?.trim() || !email?.trim()) {
    throw createServiceError("Nome e e-mail são obrigatórios.", 400);
  }

  const normalizedStudentStatus = status || "active";

  if (!ALLOWED_STUDENT_STATUSES.includes(normalizedStudentStatus)) {
    throw createServiceError("Status do aluno inválido.", 400);
  }

  const normalizedUserStatus =
    normalizedStudentStatus === "active" ? "active" : "inactive";

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [studentRows] = await connection.query(
      `SELECT id, user_id FROM students WHERE id = ? LIMIT 1`,
      [normalizedStudentId]
    );

    if (studentRows.length === 0) {
      throw createServiceError("Aluno não encontrado.", 404);
    }

    const student = studentRows[0];

    const [existingEmailRows] = await connection.query(
      `SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1`,
      [email.trim(), student.user_id]
    );

    if (existingEmailRows.length > 0) {
      throw createServiceError("Este e-mail já está cadastrado.", 409);
    }

    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);

      await connection.query(
        `
          UPDATE users
          SET name = ?, email = ?, password_hash = ?, gender = ?, status = ?, updated_at = NOW()
          WHERE id = ?
        `,
        [name.trim(), email.trim(), passwordHash, gender || null, normalizedUserStatus, student.user_id]
      );
    } else {
      await connection.query(
        `
          UPDATE users
          SET name = ?, email = ?, gender = ?, status = ?, updated_at = NOW()
          WHERE id = ?
        `,
        [name.trim(), email.trim(), gender || null, normalizedUserStatus, student.user_id]
      );
    }

    const [studentUpdateResult] = await connection.query(
      `
        UPDATE students
        SET
          name = ?, email = ?, gender = ?, birth_date = ?, cpf = ?, phone = ?,
          address = ?, status = ?, updated_at = NOW()
        WHERE id = ?
      `,
      [
        name.trim(),
        email.trim(),
        gender || null,
        birth_date || null,
        cpf?.trim() || null,
        phone?.trim() || null,
        address?.trim() || null,
        normalizedStudentStatus,
        normalizedStudentId,
      ]
    );

    if (studentUpdateResult.affectedRows === 0) {
      throw createServiceError("Não foi possível atualizar o aluno.", 404);
    }

    await connection.commit();

    return {
      id: normalizedStudentId,
      user_id: student.user_id,
      name: name.trim(),
      email: email.trim(),
      gender: gender || null,
      birth_date: birth_date || null,
      cpf: cpf?.trim() || null,
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      status: normalizedStudentStatus,
    };
  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      throw createServiceError(
        "Já existe um cadastro utilizando estes dados.",
        409
      );
    }

    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Desativa um aluno sem removê-lo fisicamente (soft delete):
 * students.status='cancelled' + users.status='inactive'.
 */
async function deleteStudent(db, id) {
  const normalizedStudentId = Number(id);

  if (!Number.isInteger(normalizedStudentId) || normalizedStudentId <= 0) {
    throw createServiceError("ID do aluno inválido.", 400);
  }

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [studentRows] = await connection.query(
      `SELECT id, user_id, status FROM students WHERE id = ? LIMIT 1`,
      [normalizedStudentId]
    );

    if (studentRows.length === 0) {
      throw createServiceError("Aluno não encontrado.", 404);
    }

    const student = studentRows[0];

    if (student.status === "cancelled") {
      throw createServiceError("Este aluno já está removido.", 409);
    }

    const [studentUpdateResult] = await connection.query(
      `UPDATE students SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
      [normalizedStudentId]
    );

    if (studentUpdateResult.affectedRows === 0) {
      throw createServiceError(
        "Não foi possível atualizar o status do aluno.",
        404
      );
    }

    const [userUpdateResult] = await connection.query(
      `UPDATE users SET status = 'inactive', updated_at = NOW() WHERE id = ?`,
      [student.user_id]
    );

    if (userUpdateResult.affectedRows === 0) {
      throw createServiceError(
        "Não foi possível desativar o usuário do aluno.",
        404
      );
    }

    await connection.commit();

    return { id: normalizedStudentId, user_id: student.user_id, status: "cancelled" };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  createServiceError,
  listStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
};
