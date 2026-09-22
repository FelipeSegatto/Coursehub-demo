const {
  assertTeacherAssignedToCourse,
} = require("../courses/courseTeacherService");

const ALLOWED_CLASS_STATUSES = ["active", "inactive", "finished"];
const ALLOWED_SHIFTS = ["morning", "afternoon", "night", "online"];

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

function normalizePagination(page, limit) {
  const normalizedPage = Number.isInteger(Number(page)) && Number(page) > 0
    ? Number(page)
    : DEFAULT_PAGE;

  const normalizedLimit =
    Number.isInteger(Number(limit)) && Number(limit) > 0
      ? Math.min(Number(limit), MAX_LIMIT)
      : DEFAULT_LIMIT;

  return {
    page: normalizedPage,
    limit: normalizedLimit,
    offset: (normalizedPage - 1) * normalizedLimit,
  };
}

function normalizeId(value, message) {
  const normalized = Number(value);

  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw createServiceError(message, 400);
  }

  return normalized;
}

function mapClassRow(row) {
  return {
    id: row.id,
    name: row.name,
    course: { id: row.course_id, name: row.course_name },
    teacher: row.teacher_id
      ? { id: row.teacher_id, name: row.teacher_name }
      : null,
    status: row.status,
    shift: row.shift,
    startDate: row.start_date,
    endDate: row.end_date,
    activeEnrollments: Number(row.active_enrollments || 0),
    sessionCount: Number(row.session_count || 0),
  };
}

function buildListFilters(filters) {
  const conditions = ["1 = 1"];
  const params = [];

  const search = filters.search?.trim();

  if (search) {
    conditions.push("(c.name LIKE ? OR co.name LIKE ? OR t.name LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (filters.courseId) {
    const courseId = normalizeId(filters.courseId, "ID do curso inválido.");
    conditions.push("c.course_id = ?");
    params.push(courseId);
  }

  if (filters.teacherId) {
    const teacherId = normalizeId(filters.teacherId, "ID do professor inválido.");
    conditions.push("c.teacher_id = ?");
    params.push(teacherId);
  }

  if (filters.status) {
    if (!ALLOWED_CLASS_STATUSES.includes(filters.status)) {
      throw createServiceError("Status de turma inválido.", 400);
    }

    conditions.push("c.status = ?");
    params.push(filters.status);
  }

  if (filters.shift) {
    if (!ALLOWED_SHIFTS.includes(filters.shift)) {
      throw createServiceError("Turno inválido.", 400);
    }

    conditions.push("c.shift = ?");
    params.push(filters.shift);
  }

  return { whereClause: conditions.join(" AND "), params };
}

/**
 * Números globais para os cards de visão geral — independentes dos
 * filtros/paginação da listagem, senão os cards mudariam a cada
 * página ou filtro aplicado.
 */
async function getClassesSummary(db) {
  const [rows] = await db.promise().query(
    `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status IN ('inactive', 'finished') THEN 1 ELSE 0 END)
          AS inactive_or_finished,
        (SELECT COUNT(*) FROM enrollments WHERE status = 'active' AND class_id IS NOT NULL)
          AS total_active_enrollments
      FROM classes
    `
  );

  const row = rows[0] || {};

  return {
    total: Number(row.total || 0),
    active: Number(row.active || 0),
    inactiveOrFinished: Number(row.inactive_or_finished || 0),
    totalActiveEnrollments: Number(row.total_active_enrollments || 0),
  };
}

/**
 * Lista turmas com filtros e paginação. activeEnrollments/sessionCount
 * vêm de subconsultas agregadas (LEFT JOIN de derived tables), nunca
 * uma query por turma.
 */
async function listClasses(db, filters = {}) {
  const { whereClause, params } = buildListFilters(filters);
  const { page, limit, offset } = normalizePagination(
    filters.page,
    filters.limit
  );

  const [summary, [countRows], [rows]] = await Promise.all([
    getClassesSummary(db),
    db.promise().query(
      `
        SELECT COUNT(*) AS total
        FROM classes c
        INNER JOIN courses co ON co.id = c.course_id
        INNER JOIN teachers t ON t.id = c.teacher_id
        WHERE ${whereClause}
      `,
      params
    ),
    db.promise().query(
      `
        SELECT
          c.id, c.name, c.status, c.shift, c.start_date, c.end_date,
          co.id AS course_id, co.name AS course_name,
          t.id AS teacher_id, t.name AS teacher_name,
          COALESCE(enrollment_stats.active_enrollments, 0) AS active_enrollments,
          COALESCE(session_stats.session_count, 0) AS session_count
        FROM classes c
        INNER JOIN courses co ON co.id = c.course_id
        INNER JOIN teachers t ON t.id = c.teacher_id
        LEFT JOIN (
          SELECT class_id, COUNT(*) AS active_enrollments
          FROM enrollments
          WHERE status = 'active'
          GROUP BY class_id
        ) enrollment_stats ON enrollment_stats.class_id = c.id
        LEFT JOIN (
          SELECT class_id, COUNT(*) AS session_count
          FROM class_sessions
          GROUP BY class_id
        ) session_stats ON session_stats.class_id = c.id
        WHERE ${whereClause}
        ORDER BY c.name ASC
        LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    ),
  ]);

  const total = Number(countRows[0]?.total || 0);

  return {
    data: rows.map(mapClassRow),
    summary,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  };
}

async function getClassById(db, id) {
  const classId = normalizeId(id, "ID da turma inválido.");

  const [rows] = await db.promise().query(
    `
      SELECT
        c.id, c.name, c.status, c.shift, c.start_date, c.end_date,
        co.id AS course_id, co.name AS course_name,
        t.id AS teacher_id, t.name AS teacher_name,
        COALESCE(enrollment_stats.active_enrollments, 0) AS active_enrollments,
        COALESCE(session_stats.session_count, 0) AS session_count
      FROM classes c
      INNER JOIN courses co ON co.id = c.course_id
      INNER JOIN teachers t ON t.id = c.teacher_id
      LEFT JOIN (
        SELECT class_id, COUNT(*) AS active_enrollments
        FROM enrollments
        WHERE status = 'active'
        GROUP BY class_id
      ) enrollment_stats ON enrollment_stats.class_id = c.id
      LEFT JOIN (
        SELECT class_id, COUNT(*) AS session_count
        FROM class_sessions
        GROUP BY class_id
      ) session_stats ON session_stats.class_id = c.id
      WHERE c.id = ?
      LIMIT 1
    `,
    [classId]
  );

  if (rows.length === 0) {
    throw createServiceError("Turma não encontrada.", 404);
  }

  return mapClassRow(rows[0]);
}

/**
 * Impacto de uma exclusão/arquivamento: contagens em paralelo,
 * nenhuma delas depende da outra.
 */
async function getClassImpact(runner, classId) {
  const [
    [enrollmentRows],
    [activityRows],
    [contentRows],
    [sessionRows],
    [attendanceRows],
  ] = await Promise.all([
    runner.query(
      `SELECT COUNT(*) AS count FROM enrollments WHERE class_id = ? AND status = 'active'`,
      [classId]
    ),
    runner.query(`SELECT COUNT(*) AS count FROM activities WHERE class_id = ?`, [
      classId,
    ]),
    runner.query(
      `SELECT COUNT(*) AS count FROM course_contents WHERE class_id = ?`,
      [classId]
    ),
    runner.query(
      `SELECT COUNT(*) AS count FROM class_sessions WHERE class_id = ?`,
      [classId]
    ),
    runner.query(
      `
        SELECT COUNT(*) AS count
        FROM attendance a
        INNER JOIN class_sessions cs ON cs.id = a.class_session_id
        WHERE cs.class_id = ?
      `,
      [classId]
    ),
  ]);

  return {
    activeEnrollments: Number(enrollmentRows[0]?.count || 0),
    activities: Number(activityRows[0]?.count || 0),
    courseContents: Number(contentRows[0]?.count || 0),
    sessions: Number(sessionRows[0]?.count || 0),
    attendanceRecords: Number(attendanceRows[0]?.count || 0),
  };
}

function hasAnyImpact(impact) {
  return Object.values(impact).some((count) => count > 0);
}

/**
 * Cria uma turma. Curso e professor precisam existir; professor
 * precisa estar ativo. Sem constraint real de nome duplicado no
 * schema — aplica só uma checagem de aplicação (mesmo nome + mesmo
 * curso já existente, status não finalizado).
 */
async function createClass(db, payload) {
  const { name, course_id, teacher_id, shift, start_date, end_date, status } =
    payload;

  if (!name?.trim()) {
    throw createServiceError("O nome da turma é obrigatório.", 400);
  }

  if (name.trim().length > 120) {
    throw createServiceError(
      "O nome da turma deve ter no máximo 120 caracteres.",
      400
    );
  }

  const courseId = normalizeId(course_id, "Curso é obrigatório e deve ser válido.");
  const teacherId = normalizeId(
    teacher_id,
    "Professor é obrigatório e deve ser válido."
  );

  const normalizedShift = shift || "online";

  if (!ALLOWED_SHIFTS.includes(normalizedShift)) {
    throw createServiceError("Turno inválido.", 400);
  }

  const normalizedStatus = status || "active";

  if (!ALLOWED_CLASS_STATUSES.includes(normalizedStatus)) {
    throw createServiceError("Status de turma inválido.", 400);
  }

  if (start_date && end_date && new Date(end_date) < new Date(start_date)) {
    throw createServiceError(
      "A data final não pode ser anterior à data inicial.",
      400
    );
  }

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [courseRows] = await connection.query(
      `SELECT id FROM courses WHERE id = ? LIMIT 1`,
      [courseId]
    );

    if (courseRows.length === 0) {
      throw createServiceError("Curso não encontrado.", 404);
    }

    const [teacherRows] = await connection.query(
      `SELECT id, status FROM teachers WHERE id = ? LIMIT 1`,
      [teacherId]
    );

    if (teacherRows.length === 0) {
      throw createServiceError("Professor não encontrado.", 404);
    }

    if (teacherRows[0].status !== "active") {
      throw createServiceError(
        "O professor selecionado não está ativo.",
        409
      );
    }

    // Só professores vinculados ao curso da turma podem ser
    // responsáveis por ela -- validado no backend independente do
    // que o frontend já filtra (ver courseTeacherService.js).
    await assertTeacherAssignedToCourse(
      connection,
      { courseId, teacherId },
      { statusCode: 400, message: "Professor não está vinculado ao curso." }
    );

    const [duplicateRows] = await connection.query(
      `
        SELECT id FROM classes
        WHERE course_id = ? AND name = ? AND status <> 'finished'
        LIMIT 1
      `,
      [courseId, name.trim()]
    );

    if (duplicateRows.length > 0) {
      throw createServiceError(
        "Já existe uma turma com este nome para este curso.",
        409
      );
    }

    const [result] = await connection.query(
      `
        INSERT INTO classes
          (course_id, teacher_id, name, shift, start_date, end_date, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        courseId,
        teacherId,
        name.trim(),
        normalizedShift,
        start_date || null,
        end_date || null,
        normalizedStatus,
      ]
    );

    await connection.commit();

    return getClassById(db, result.insertId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Atualiza uma turma. course_id é imutável após a criação: turmas
 * têm activities/course_contents com seu próprio course_id
 * associado, e não há validação cruzada no schema que impeça uma
 * inconsistência silenciosa se a turma migrasse de curso. Mudança
 * de curso, se necessária, deve ser um fluxo explícito futuro, não
 * um PUT genérico.
 */
async function updateClass(db, id, payload) {
  const classId = normalizeId(id, "ID da turma inválido.");

  const { name, teacher_id, shift, start_date, end_date, status } = payload;

  if (!name?.trim()) {
    throw createServiceError("O nome da turma é obrigatório.", 400);
  }

  if (name.trim().length > 120) {
    throw createServiceError(
      "O nome da turma deve ter no máximo 120 caracteres.",
      400
    );
  }

  const teacherId = normalizeId(
    teacher_id,
    "Professor é obrigatório e deve ser válido."
  );

  const normalizedShift = shift || "online";

  if (!ALLOWED_SHIFTS.includes(normalizedShift)) {
    throw createServiceError("Turno inválido.", 400);
  }

  const normalizedStatus = status || "active";

  if (!ALLOWED_CLASS_STATUSES.includes(normalizedStatus)) {
    throw createServiceError("Status de turma inválido.", 400);
  }

  if (start_date && end_date && new Date(end_date) < new Date(start_date)) {
    throw createServiceError(
      "A data final não pode ser anterior à data inicial.",
      400
    );
  }

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [classRows] = await connection.query(
      `SELECT id, course_id, name FROM classes WHERE id = ? LIMIT 1`,
      [classId]
    );

    if (classRows.length === 0) {
      throw createServiceError("Turma não encontrada.", 404);
    }

    const courseId = classRows[0].course_id;

    const [teacherRows] = await connection.query(
      `SELECT id, status FROM teachers WHERE id = ? LIMIT 1`,
      [teacherId]
    );

    if (teacherRows.length === 0) {
      throw createServiceError("Professor não encontrado.", 404);
    }

    if (teacherRows[0].status !== "active") {
      throw createServiceError(
        "O professor selecionado não está ativo.",
        409
      );
    }

    // Só professores vinculados ao curso da turma podem ser
    // responsáveis por ela -- validado no backend independente do
    // que o frontend já filtra (ver courseTeacherService.js).
    await assertTeacherAssignedToCourse(
      connection,
      { courseId, teacherId },
      { statusCode: 400, message: "Professor não está vinculado ao curso." }
    );

    const [duplicateRows] = await connection.query(
      `
        SELECT id FROM classes
        WHERE course_id = ? AND name = ? AND status <> 'finished' AND id <> ?
        LIMIT 1
      `,
      [courseId, name.trim(), classId]
    );

    if (duplicateRows.length > 0) {
      throw createServiceError(
        "Já existe uma turma com este nome para este curso.",
        409
      );
    }

    const [result] = await connection.query(
      `
        UPDATE classes
        SET teacher_id = ?, name = ?, shift = ?, start_date = ?, end_date = ?,
            status = ?, updated_at = NOW()
        WHERE id = ?
      `,
      [
        teacherId,
        name.trim(),
        normalizedShift,
        start_date || null,
        end_date || null,
        normalizedStatus,
        classId,
      ]
    );

    if (result.affectedRows === 0) {
      throw createServiceError("Não foi possível atualizar a turma.", 404);
    }

    await connection.commit();

    return getClassById(db, classId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateClassStatus(db, id, status) {
  const classId = normalizeId(id, "ID da turma inválido.");

  if (!ALLOWED_CLASS_STATUSES.includes(status)) {
    throw createServiceError("Status de turma inválido.", 400);
  }

  const [result] = await db.promise().query(
    `UPDATE classes SET status = ?, updated_at = NOW() WHERE id = ?`,
    [status, classId]
  );

  if (result.affectedRows === 0) {
    throw createServiceError("Turma não encontrada.", 404);
  }

  return getClassById(db, classId);
}

async function getClassImpactById(db, id) {
  const classId = normalizeId(id, "ID da turma inválido.");

  const [classRows] = await db.promise().query(
    `SELECT id FROM classes WHERE id = ? LIMIT 1`,
    [classId]
  );

  if (classRows.length === 0) {
    throw createServiceError("Turma não encontrada.", 404);
  }

  return getClassImpact(db.promise(), classId);
}

/**
 * Exclusão física só ocorre quando o impacto é zero em todas as
 * dimensões (turma "vazia"). Caso contrário, 409 com o relatório de
 * impacto anexado — a decisão de arquivar/inativar fica com quem
 * chama a API (PATCH /status), nunca automática aqui.
 */
async function deleteClass(db, id) {
  const classId = normalizeId(id, "ID da turma inválido.");

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [classRows] = await connection.query(
      `SELECT id FROM classes WHERE id = ? LIMIT 1`,
      [classId]
    );

    if (classRows.length === 0) {
      throw createServiceError("Turma não encontrada.", 404);
    }

    const impact = await getClassImpact(connection, classId);

    if (hasAnyImpact(impact)) {
      const error = createServiceError(
        "Esta turma possui vínculos ativos e não pode ser excluída. Prefira inativar/arquivar.",
        409
      );
      error.extra = { impact };
      throw error;
    }

    await connection.query(`DELETE FROM classes WHERE id = ?`, [classId]);

    await connection.commit();

    return { id: classId, deleted: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  createServiceError,
  listClasses,
  getClassById,
  getClassImpactById,
  createClass,
  updateClass,
  updateClassStatus,
  deleteClass,
  ALLOWED_CLASS_STATUSES,
  ALLOWED_SHIFTS,
};
