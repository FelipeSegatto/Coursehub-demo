const {
  attachPricingToCourses,
  getPricingSummaryForCourse,
  listActivePlansForCourse,
} = require("../courses/coursePricingService");

const {
  normalizeTeacherIds,
  validateTeacherIds,
  listCourseTeachers,
  syncCourseTeachers,
} = require("../courses/courseTeacherService");

const ALLOWED_COURSE_STATUSES = ["active", "inactive", "draft", "archived"];

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

function normalizeTeacherId(teacherId) {
  const normalized =
    teacherId !== null && teacherId !== undefined && teacherId !== ""
      ? Number(teacherId)
      : null;

  if (normalized !== null && (!Number.isInteger(normalized) || normalized <= 0)) {
    throw createServiceError("ID do professor inválido.", 400);
  }

  return normalized;
}

function normalizeNumericField(value, fieldErrorMessage) {
  const normalized =
    value !== null && value !== undefined && value !== "" ? Number(value) : null;

  if (normalized !== null && (Number.isNaN(normalized) || normalized < 0)) {
    throw createServiceError(fieldErrorMessage, 400);
  }

  return normalized;
}

/**
 * Lista todos os cursos cadastrados, com professor responsável
 * e totais de alunos/conteúdos.
 */
async function listCourses(db) {
  const [courses] = await db.promise().query(
    `
      SELECT
        c.id, c.name, c.category, c.nivel, c.status, c.workload_hours,
        t.name AS teacher_name,
        COUNT(DISTINCT e.student_id) AS total_students,
        COUNT(DISTINCT cc.id) AS total_contents
      FROM courses c
      LEFT JOIN teachers t ON t.id = c.teacher_id
      LEFT JOIN enrollments e ON e.course_id = c.id
      LEFT JOIN course_contents cc ON cc.course_id = c.id
      GROUP BY c.id, c.name, c.category, c.nivel, c.status, c.workload_hours, t.name
      ORDER BY c.name ASC
    `
  );

  // Professores N:N anexados em lote (uma única query para todos os
  // cursos desta página, nunca N+1) -- teacher_name acima continua
  // sendo devolvido por compatibilidade (courses.teacher_id legado),
  // teachers/teacherIds é a fonte que reflete todos os vínculos
  // ativos via course_teachers.
  const [membershipRows] = await db.promise().query(
    `
      SELECT ct.course_id, t.id AS teacher_id, t.name AS teacher_name
      FROM course_teachers ct
      INNER JOIN teachers t ON t.id = ct.teacher_id
      WHERE ct.status = 'active'
      ORDER BY t.name ASC
    `
  );

  const teachersByCourseId = new Map();

  for (const row of membershipRows) {
    if (!teachersByCourseId.has(row.course_id)) {
      teachersByCourseId.set(row.course_id, []);
    }

    teachersByCourseId.get(row.course_id).push({ id: row.teacher_id, name: row.teacher_name });
  }

  const coursesWithTeachers = courses.map((course) => {
    const teachers = teachersByCourseId.get(course.id) || [];

    return {
      ...course,
      teachers,
      teacherIds: teachers.map((teacher) => teacher.id),
    };
  });

  // pricing é anexado em lote (uma única query agrupada para todos os
  // cursos desta página) -- courses.price nunca é lido aqui, ver
  // coursePricingService.
  return attachPricingToCourses(db, coursesWithTeachers);
}

/**
 * Busca os dados completos de um curso pelo ID (formulário de edição).
 */
async function getCourseById(db, id) {
  const normalizedCourseId = Number(id);

  if (!Number.isInteger(normalizedCourseId) || normalizedCourseId <= 0) {
    throw createServiceError("ID do curso inválido.", 400);
  }

  const [courseRows] = await db.promise().query(
    `
      SELECT
        c.id, c.name, c.description, c.workload_hours, c.price, c.status,
        c.teacher_id, c.image_url, c.nivel, c.expanded_description, c.syllabus,
        c.category,
        t.name AS teacher_name
      FROM courses c
      LEFT JOIN teachers t ON t.id = c.teacher_id
      WHERE c.id = ?
      LIMIT 1
    `,
    [normalizedCourseId]
  );

  if (courseRows.length === 0) {
    throw createServiceError("Curso não encontrado.", 404);
  }

  // reconcileLegacy: true -- se courses.teacher_id ainda não tiver um
  // vínculo ativo correspondente em course_teachers (curso nunca
  // editado pelo fluxo novo), sincroniza aqui mesmo, na leitura, para
  // que course_teachers vá convergindo para a fonte oficial de
  // membership.
  const teachers = await listCourseTeachers(db.promise(), normalizedCourseId, {
    reconcileLegacy: true,
  });

  // `price` continua sendo devolvido aqui só para o formulário
  // administrativo conseguir reenviar o valor inalterado no PUT (o
  // campo não é mais editável na UI, ver AdminCreateEditModal) --
  // nunca é usado como preço comercial. `pricing` é a fonte oficial,
  // usada por quem exibe preço de fato (listagem admin, páginas
  // públicas).
  return {
    ...courseRows[0],
    teachers,
    teacherIds: teachers.map((teacher) => teacher.id),
    pricing: await getPricingSummaryForCourse(db, normalizedCourseId),
  };
}

/**
 * Cadastra um novo curso. Um curso pode ser criado sem professor
 * responsável (courses.teacher_id aceita NULL).
 */
async function createCourse(db, payload) {
  const {
    name,
    description,
    workload_hours,
    price,
    status,
    teacher_id,
    teacherIds,
    image_url,
    nivel,
    expanded_description,
    syllabus,
    category,
  } = payload;

  if (!name?.trim()) {
    throw createServiceError("O nome do curso é obrigatório.", 400);
  }

  const normalizedTeacherId = normalizeTeacherId(teacher_id);
  const normalizedStatus = status || "draft";

  // teacherIds ausente (undefined) = chamador legado que ainda não
  // fala a nova forma de curso -- não mexe em course_teachers. Um
  // array (mesmo vazio, "nenhum professor vinculado") é tratado como
  // instrução explícita de sincronizar para exatamente esse conjunto.
  const hasTeacherIds = teacherIds !== undefined;
  const normalizedTeacherIds = hasTeacherIds ? normalizeTeacherIds(teacherIds) : [];

  if (!ALLOWED_COURSE_STATUSES.includes(normalizedStatus)) {
    throw createServiceError("Status do curso inválido.", 400);
  }

  const normalizedWorkloadHours = normalizeNumericField(
    workload_hours,
    "Carga horária inválida."
  );
  const normalizedPrice = normalizeNumericField(price, "Preço inválido.");

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    if (normalizedTeacherId !== null) {
      const [teacherRows] = await connection.query(
        `SELECT id FROM teachers WHERE id = ? LIMIT 1`,
        [normalizedTeacherId]
      );

      if (teacherRows.length === 0) {
        throw createServiceError("Professor não encontrado.", 404);
      }
    }

    if (hasTeacherIds) {
      await validateTeacherIds(connection, normalizedTeacherIds);
    }

    const [result] = await connection.query(
      `
        INSERT INTO courses
          (name, description, workload_hours, price, status, teacher_id, image_url,
           nivel, expanded_description, syllabus, category, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        name.trim(),
        description?.trim() || null,
        normalizedWorkloadHours,
        normalizedPrice,
        normalizedStatus,
        normalizedTeacherId,
        image_url?.trim() || null,
        nivel?.trim() || "Iniciante",
        expanded_description?.trim() || null,
        syllabus?.trim() || null,
        category?.trim() || null,
      ]
    );

    const newCourseId = result.insertId;

    // teacherIds é a fonte oficial de membership -- courses.teacher_id
    // acima nunca é derivado dela nesta versão (sem noção de
    // "principal"), fica exatamente com o que o formulário legado
    // enviou.
    if (hasTeacherIds) {
      await syncCourseTeachers(connection, newCourseId, normalizedTeacherIds);
    }

    await connection.commit();

    return {
      id: newCourseId,
      name: name.trim(),
      description: description?.trim() || null,
      workload_hours: normalizedWorkloadHours,
      price: normalizedPrice,
      status: normalizedStatus,
      teacher_id: normalizedTeacherId,
      teacherIds: hasTeacherIds ? normalizedTeacherIds : undefined,
      image_url: image_url?.trim() || null,
      nivel: nivel?.trim() || "Iniciante",
      expanded_description: expanded_description?.trim() || null,
      syllabus: syllabus?.trim() || null,
      category: category?.trim() || null,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Atualiza os dados de um curso.
 */
async function updateCourse(db, id, payload) {
  const normalizedCourseId = Number(id);

  if (!Number.isInteger(normalizedCourseId) || normalizedCourseId <= 0) {
    throw createServiceError("ID do curso inválido.", 400);
  }

  const {
    name,
    description,
    workload_hours,
    price,
    status,
    teacher_id,
    teacherIds,
    image_url,
    nivel,
    expanded_description,
    syllabus,
    category,
  } = payload;

  if (!name?.trim()) {
    throw createServiceError("O nome do curso é obrigatório.", 400);
  }

  const normalizedTeacherId = normalizeTeacherId(teacher_id);
  const normalizedStatus = status || "draft";

  if (!ALLOWED_COURSE_STATUSES.includes(normalizedStatus)) {
    throw createServiceError("Status do curso inválido.", 400);
  }

  const normalizedWorkloadHours = normalizeNumericField(
    workload_hours,
    "Carga horária inválida."
  );
  const normalizedPrice = normalizeNumericField(price, "Preço inválido.");

  const hasTeacherIds = teacherIds !== undefined;
  const normalizedTeacherIds = hasTeacherIds ? normalizeTeacherIds(teacherIds) : [];

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [courseRows] = await connection.query(
      `SELECT id FROM courses WHERE id = ? LIMIT 1`,
      [normalizedCourseId]
    );

    if (courseRows.length === 0) {
      throw createServiceError("Curso não encontrado.", 404);
    }

    if (normalizedTeacherId !== null) {
      const [teacherRows] = await connection.query(
        `SELECT id FROM teachers WHERE id = ? LIMIT 1`,
        [normalizedTeacherId]
      );

      if (teacherRows.length === 0) {
        throw createServiceError("Professor não encontrado.", 404);
      }
    }

    if (hasTeacherIds) {
      await validateTeacherIds(connection, normalizedTeacherIds);
    }

    const [result] = await connection.query(
      `
        UPDATE courses
        SET
          name = ?, description = ?, workload_hours = ?, price = ?, status = ?,
          teacher_id = ?, image_url = ?, nivel = ?, expanded_description = ?,
          syllabus = ?, category = ?, updated_at = NOW()
        WHERE id = ?
      `,
      [
        name.trim(),
        description?.trim() || null,
        normalizedWorkloadHours,
        normalizedPrice,
        normalizedStatus,
        normalizedTeacherId,
        image_url?.trim() || null,
        nivel?.trim() || "Iniciante",
        expanded_description?.trim() || null,
        syllabus?.trim() || null,
        category?.trim() || null,
        normalizedCourseId,
      ]
    );

    if (result.affectedRows === 0) {
      throw createServiceError("Não foi possível atualizar o curso.", 404);
    }

    if (hasTeacherIds) {
      await syncCourseTeachers(connection, normalizedCourseId, normalizedTeacherIds);
    }

    await connection.commit();

    return {
      id: normalizedCourseId,
      name: name.trim(),
      description: description?.trim() || null,
      workload_hours: normalizedWorkloadHours,
      price: normalizedPrice,
      status: normalizedStatus,
      teacher_id: normalizedTeacherId,
      teacherIds: hasTeacherIds ? normalizedTeacherIds : undefined,
      image_url: image_url?.trim() || null,
      nivel: nivel?.trim() || "Iniciante",
      expanded_description: expanded_description?.trim() || null,
      syllabus: syllabus?.trim() || null,
      category: category?.trim() || null,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Arquiva um curso sem removê-lo fisicamente (soft delete):
 * courses.status='archived'.
 */
async function deleteCourse(db, id) {
  const normalizedCourseId = Number(id);

  if (!Number.isInteger(normalizedCourseId) || normalizedCourseId <= 0) {
    throw createServiceError("ID do curso inválido.", 400);
  }

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [courseRows] = await connection.query(
      `SELECT id, status FROM courses WHERE id = ? LIMIT 1`,
      [normalizedCourseId]
    );

    if (courseRows.length === 0) {
      throw createServiceError("Curso não encontrado.", 404);
    }

    if (courseRows[0].status === "archived") {
      throw createServiceError("Este curso já está arquivado.", 409);
    }

    const [result] = await connection.query(
      `UPDATE courses SET status = 'archived', updated_at = NOW() WHERE id = ?`,
      [normalizedCourseId]
    );

    if (result.affectedRows === 0) {
      throw createServiceError("Não foi possível arquivar o curso.", 404);
    }

    await connection.commit();

    return { id: normalizedCourseId, status: "archived" };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Lista os planos de preço ATIVOS de um curso — usado pela criação
 * de matrícula para o admin escolher qual plano gera o contrato
 * financeiro. Delegado ao serviço compartilhado (coursePricingService)
 * -- a página de gestão de planos comerciais e a rota pública
 * equivalente reaproveitam a mesma consulta, nunca uma segunda
 * implementação da regra.
 */
async function listActivePricingPlansByCourse(db, courseId) {
  return listActivePlansForCourse(db, courseId);
}

module.exports = {
  createServiceError,
  listCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  listActivePricingPlansByCourse,
};
