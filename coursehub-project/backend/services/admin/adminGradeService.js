const { withTransaction } = require("../../utils/dbTransaction");
const { notifyGradePublished } = require("../activities/activityGradingService");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

function normalizePagination(page, limit) {
  const normalizedPage =
    Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : DEFAULT_PAGE;

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

function mapGradeRow(row) {
  return {
    id: row.id,
    submissionId: row.submission_id,
    student: {
      id: row.student_id,
      name: row.student_name,
      registrationNumber: row.registration_number,
    },
    course: { id: row.course_id, name: row.course_name },
    class: row.class_id ? { id: row.class_id, name: row.class_name } : null,
    activity: { id: row.activity_id, title: row.title },
    teacher: row.teacher_id ? { id: row.teacher_id, name: row.teacher_name } : null,
    score: row.score,
    maxScore: row.max_score,
    feedback: row.feedback,
    gradedAt: row.graded_at,
    adjustment:
      row.admin_adjusted_at !== null
        ? {
            adjustedAt: row.admin_adjusted_at,
            adjustedBy: row.admin_adjusted_by_user_id
              ? { id: row.admin_adjusted_by_user_id, name: row.admin_adjusted_by_name }
              : null,
            reason: row.admin_adjustment_reason,
            previousScore: row.previous_score,
          }
        : null,
  };
}

const BASE_JOIN = `
  FROM grades g
  INNER JOIN students st ON st.id = g.student_id
  INNER JOIN courses c ON c.id = g.course_id
  INNER JOIN activities a ON a.id = g.activity_id
  LEFT JOIN classes cl ON cl.id = a.class_id
  LEFT JOIN teachers t ON t.id = g.teacher_id
  LEFT JOIN users adj_u ON adj_u.id = g.admin_adjusted_by_user_id
`;

const SELECT_COLUMNS = `
  g.id, g.submission_id, g.student_id, g.course_id, g.activity_id, g.teacher_id,
  g.title, g.score, g.max_score, g.feedback, g.graded_at,
  g.admin_adjusted_at, g.admin_adjusted_by_user_id, g.admin_adjustment_reason, g.previous_score,

  st.name AS student_name, st.registration_number,
  c.name AS course_name,
  a.class_id, cl.name AS class_name,
  t.name AS teacher_name,
  adj_u.name AS admin_adjusted_by_name
`;

/**
 * Um filtro puramente cosmético (status, ordenação) nunca basta
 * sozinho para liberar uma consulta -- exige curso, turma, professor
 * ou uma busca com pelo menos 3 caracteres normalizados. Validado
 * aqui (backend) porque o frontend não pode ser a única barreira
 * contra uma consulta institucional ampla disfarçada de "filtro".
 */
function hasValidScope(filters) {
  const search = filters.search?.trim() || "";

  return Boolean(filters.courseId || filters.classId || filters.teacherId || search.length >= 3);
}

function buildListFilters(filters) {
  if (!hasValidScope(filters)) {
    throw createServiceError(
      "Selecione ao menos curso, turma, professor ou busque por pelo menos 3 caracteres antes de consultar.",
      400
    );
  }

  const conditions = ["1 = 1"];
  const params = [];

  const search = filters.search?.trim();

  if (search) {
    conditions.push(
      "(st.name LIKE ? OR st.registration_number LIKE ? OR a.title LIKE ?)"
    );
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (filters.courseId) {
    conditions.push("g.course_id = ?");
    params.push(normalizeId(filters.courseId, "ID do curso inválido."));
  }

  if (filters.classId) {
    conditions.push("a.class_id = ?");
    params.push(normalizeId(filters.classId, "ID da turma inválido."));
  }

  if (filters.teacherId) {
    conditions.push("g.teacher_id = ?");
    params.push(normalizeId(filters.teacherId, "ID do professor inválido."));
  }

  if (filters.activityId) {
    conditions.push("g.activity_id = ?");
    params.push(normalizeId(filters.activityId, "ID da atividade inválido."));
  }

  if (filters.adjustedOnly === "true" || filters.adjustedOnly === true) {
    conditions.push("g.admin_adjusted_at IS NOT NULL");
  }

  return { whereClause: conditions.join(" AND "), params };
}

/**
 * Recebe o mesmo WHERE/params da listagem -- um resumo que ignorasse
 * o filtro aplicado mostraria números que não batem com a tabela
 * (e continuaria pagando o custo de uma varredura ampla, o problema
 * que o filtro obrigatório existe pra evitar).
 */
async function getGradesSummary(db, whereClause, params) {
  const [rows] = await db.promise().query(
    `
      SELECT
        COUNT(*) AS total,
        AVG(g.score) AS averageScore,
        SUM(CASE WHEN g.admin_adjusted_at IS NOT NULL THEN 1 ELSE 0 END) AS adjustedCount
      ${BASE_JOIN}
      WHERE ${whereClause}
    `,
    params
  );

  const row = rows[0] || {};

  return {
    total: Number(row.total || 0),
    averageScore: row.averageScore !== null ? Number(Number(row.averageScore).toFixed(1)) : null,
    adjustedCount: Number(row.adjustedCount || 0),
  };
}

async function listGrades(db, filters = {}) {
  const { whereClause, params } = buildListFilters(filters);
  const { page, limit, offset } = normalizePagination(filters.page, filters.limit);

  const [summary, [countRows], [rows]] = await Promise.all([
    getGradesSummary(db, whereClause, params),
    db.promise().query(`SELECT COUNT(*) AS total ${BASE_JOIN} WHERE ${whereClause}`, params),
    db.promise().query(
      `
        SELECT ${SELECT_COLUMNS}
        ${BASE_JOIN}
        WHERE ${whereClause}
        ORDER BY g.graded_at DESC
        LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    ),
  ]);

  const total = Number(countRows[0]?.total || 0);

  return {
    data: rows.map(mapGradeRow),
    summary,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  };
}

async function getGradeById(db, id) {
  const gradeId = normalizeId(id, "ID da nota inválido.");

  const [rows] = await db
    .promise()
    .query(`SELECT ${SELECT_COLUMNS} ${BASE_JOIN} WHERE g.id = ? LIMIT 1`, [gradeId]);

  if (rows.length === 0) {
    throw createServiceError("Nota não encontrada.", 404);
  }

  return mapGradeRow(rows[0]);
}

/**
 * Ajuste administrativo de uma nota já lançada pelo professor. Nunca
 * cria nota do zero (grades.submission_id é NOT NULL — toda nota
 * nasce de um envio já corrigido). Espelha o novo valor em
 * submissions.score para manter a tela do professor consistente,
 * sem tocar submission_answers — mesmo trade-off aceito pela
 * sobrescrita rápida usada pelo professor (o detalhamento por
 * questão pode deixar de somar o total após um ajuste).
 */
async function adjustGrade(db, id, { score, reason }, actingUserId) {
  const gradeId = normalizeId(id, "ID da nota inválido.");

  const normalizedScore = Number(score);
  const normalizedReason = typeof reason === "string" ? reason.trim() : "";

  if (Number.isNaN(normalizedScore) || normalizedScore < 0) {
    throw createServiceError("Nota inválida.", 400);
  }

  if (!normalizedReason) {
    throw createServiceError("Informe o motivo do ajuste.", 400);
  }

  await withTransaction(db, async (connection) => {
    const [rows] = await connection.query(
      `
        SELECT
          g.id, g.score, g.max_score, g.feedback, g.submission_id,
          g.student_id, g.activity_id, g.course_id,
          a.activity_kind, a.title AS activity_title,
          c.name AS course_name
        FROM grades g
        INNER JOIN activities a ON a.id = g.activity_id
        INNER JOIN courses c ON c.id = g.course_id
        WHERE g.id = ?
        FOR UPDATE
      `,
      [gradeId]
    );

    if (rows.length === 0) {
      throw createServiceError("Nota não encontrada.", 404);
    }

    const grade = rows[0];

    if (normalizedScore > Number(grade.max_score)) {
      throw createServiceError(
        `A nota não pode ultrapassar ${grade.max_score}.`,
        400
      );
    }

    const scoreChanged = Number(grade.score) !== normalizedScore;

    await connection.query(
      `
        UPDATE grades
        SET previous_score = score,
            score = ?,
            admin_adjustment_reason = ?,
            admin_adjusted_at = NOW(),
            admin_adjusted_by_user_id = ?,
            updated_at = NOW()
        WHERE id = ?
      `,
      [normalizedScore, normalizedReason, actingUserId, gradeId]
    );

    await connection.query(
      `UPDATE submissions SET score = ?, updated_at = NOW() WHERE id = ?`,
      [normalizedScore, grade.submission_id]
    );

    if (scoreChanged) {
      await notifyGradePublished(db, connection, {
        submissionId: grade.submission_id,
        studentId: grade.student_id,
        activityId: grade.activity_id,
        activityKind: grade.activity_kind,
        title: grade.activity_title,
        score: normalizedScore,
        maxScore: grade.max_score,
        feedback: grade.feedback,
        courseId: grade.course_id,
        courseName: grade.course_name,
      });
    }
  });

  // Read via the pool, after withTransaction has committed -- doing
  // this inside the callback would read stale pre-commit data
  // through a different connection.
  return getGradeById(db, gradeId);
}

module.exports = {
  createServiceError,
  hasValidScope,
  listGrades,
  getGradeById,
  adjustGrade,
};
