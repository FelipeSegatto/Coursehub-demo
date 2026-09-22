const bcrypt = require("bcryptjs");
const { notifyAdminUserCreated } = require("../notifications/adminUserNotificationService");

/**
 * Cria um erro de negócio com status HTTP associado.
 */
function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

/**
 * Lista os usuários sem retornar os hashes das senhas (rota pública).
 */
async function listUsers(db) {
  const [rows] = await db.promise().query(
    `
    SELECT id, name, email, gender, role, status, created_at, updated_at
    FROM users
    ORDER BY id ASC
    `
  );

  return rows;
}

/**
 * Cadastra um usuário aluno e cria seu perfil na tabela students.
 * Rota pública de autoatendimento — o cadastro administrativo
 * permanece em POST /api/admin/students.
 */
async function registerStudent(db, payload) {
  const { name, email, password, gender, birth_date, cpf, phone } = payload;

  const normalizedName = name?.trim();
  const normalizedEmail = email?.trim().toLowerCase();
  const finalGender = gender || "Masculino";

  if (!normalizedName || !normalizedEmail || !password) {
    throw createServiceError("Nome, e-mail e senha são obrigatórios.", 400);
  }

  if (password.length < 6) {
    throw createServiceError(
      "A senha deve possuir pelo menos 6 caracteres.",
      400
    );
  }

  // Gera o hash antes de abrir a transação (trabalho de CPU fora
  // da janela transacional).
  const passwordHash = await bcrypt.hash(password, 10);

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [userResult] = await connection.query(
      `
      INSERT INTO users
        (name, email, password_hash, gender, role, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'student', 'active', NOW(), NOW())
      `,
      [normalizedName, normalizedEmail, passwordHash, finalGender]
    );

    const userId = userResult.insertId;

    const temporaryCpf = cpf?.trim() || `PENDENTE-${userId}`;
    const temporaryRegistration = `TEMP-${userId}`;

    const [studentResult] = await connection.query(
      `
      INSERT INTO students
        (user_id, name, email, gender, registration_number, birth_date, cpf, phone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        userId,
        normalizedName,
        normalizedEmail,
        finalGender,
        temporaryRegistration,
        birth_date || "2000-01-01",
        temporaryCpf,
        phone?.trim() || "",
      ]
    );

    const studentId = studentResult.insertId;

    const registrationNumber = `STU${new Date().getFullYear()}${String(
      studentId
    ).padStart(3, "0")}`;

    await connection.query(
      `UPDATE students SET registration_number = ? WHERE id = ?`,
      [registrationNumber, studentId]
    );

    await connection.commit();

    // Autoatendimento real -- sempre notifica. actorUserId é o próprio
    // usuário recém-criado (nunca um admin), então excludeActor não
    // filtra ninguém de resolveAllActiveAdmins().
    await notifyAdminUserCreated(db, {
      userId,
      userName: normalizedName,
      userRole: "student",
      origin: "public_registration",
      actorUserId: userId,
    });

    return { userId, studentId, registrationNumber };
  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      throw createServiceError(
        error.sqlMessage?.includes("email")
          ? "Este e-mail já está cadastrado."
          : "Já existe um cadastro com esses dados.",
        409
      );
    }

    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  createServiceError,
  listUsers,
  registerStudent,
};
