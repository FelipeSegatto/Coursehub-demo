/**
 * Visão admin agregada de progresso acadêmico (conteúdos) por
 * matrícula ativa -- não existia nenhuma consulta desse tipo no
 * admin antes desta fase, só a versão escopada a um aluno
 * (studentProgressService.js, exige userId). Reaproveita a mesma
 * regra de denominador de getProgressOverview
 * (services/students/studentProgressService.js): conta só conteúdos
 * obrigatórios; se o curso não tiver nenhum obrigatório, conta todos,
 * para o curso não ficar preso em 0%. A agregação em si (soma de
 * linhas) é feita em SQL; a divisão condicional (obrigatórios ou
 * todos) é feita aqui porque depende de qual dos dois totais é > 0
 * por matrícula, o que SQL puro deixaria bem menos legível.
 */
const { CONTENT_TYPES } = require("../courseContents/courseContentScopeService");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

function normalizePagination(page, limit) {
  const normalizedPage = Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : DEFAULT_PAGE;

  const normalizedLimit =
    Number.isInteger(Number(limit)) && Number(limit) > 0 ? Math.min(Number(limit), MAX_LIMIT) : DEFAULT_LIMIT;

  return { page: normalizedPage, limit: normalizedLimit, offset: (normalizedPage - 1) * normalizedLimit };
}

function normalizeId(value, message) {
  const normalized = Number(value);

  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw createServiceError(message, 400);
  }

  return normalized;
}

function mapProgressRow(row) {
  const totalRequired = Number(row.total_required_contents || 0);
  const totalAll = Number(row.total_contents || 0);
  const completedRequired = Number(row.completed_required_contents || 0);
  const completedAll = Number(row.completed_contents || 0);

  const denominator = totalRequired > 0 ? totalRequired : totalAll;
  const completed = totalRequired > 0 ? completedRequired : completedAll;
  const progressPercentage = denominator > 0 ? Number(((completed / denominator) * 100).toFixed(2)) : 0;

  return {
    enrollmentId: row.enrollment_id,
    student: { id: row.student_id, name: row.student_name, registrationNumber: row.registration_number },
    course: { id: row.course_id, name: row.course_name },
    class: row.class_id ? { id: row.class_id, name: row.class_name } : null,
    totalContents: denominator,
    completedContents: completed,
    progressPercentage,
  };
}

const BASE_JOIN = `
  FROM enrollments e
  INNER JOIN students st ON st.id = e.student_id
  INNER JOIN courses co ON co.id = e.course_id
  LEFT JOIN classes cl ON cl.id = e.class_id
  LEFT JOIN course_contents cc
    ON cc.course_id = e.course_id
    AND cc.status = 'active'
    AND cc.type IN (${CONTENT_TYPES.map(() => "?").join(", ")})
    AND (cc.class_id IS NULL OR cc.class_id = e.class_id)
  LEFT JOIN student_content_progress scp
    ON scp.content_id = cc.id
    AND scp.student_id = e.student_id
`;

const SELECT_COLUMNS = `
  e.id AS enrollment_id, e.student_id, e.course_id, e.class_id,
  st.name AS student_name, st.registration_number,
  co.name AS course_name, cl.name AS class_name,

  COUNT(cc.id) AS total_contents,
  SUM(CASE WHEN cc.is_required = 1 THEN 1 ELSE 0 END) AS total_required_contents,
  SUM(CASE WHEN scp.status = 'completed' THEN 1 ELSE 0 END) AS completed_contents,
  SUM(CASE WHEN cc.is_required = 1 AND scp.status = 'completed' THEN 1 ELSE 0 END) AS completed_required_contents
`;

function buildListFilters(filters) {
  const conditions = ["e.status = 'active'"];
  const params = [...CONTENT_TYPES];

  const search = filters.search?.trim();

  if (search) {
    conditions.push("(st.name LIKE ? OR st.registration_number LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  if (filters.courseId) {
    conditions.push("e.course_id = ?");
    params.push(normalizeId(filters.courseId, "ID do curso inválido."));
  }

  if (filters.classId) {
    conditions.push("e.class_id = ?");
    params.push(normalizeId(filters.classId, "ID da turma inválido."));
  }

  return { whereClause: conditions.join(" AND "), params };
}

async function listAcademicProgress(db, filters = {}) {
  const { whereClause, params } = buildListFilters(filters);
  const { page, limit, offset } = normalizePagination(filters.page, filters.limit);

  const [[countRows], [rows]] = await Promise.all([
    db
      .promise()
      .query(`SELECT COUNT(*) AS total FROM (SELECT e.id ${BASE_JOIN} WHERE ${whereClause} GROUP BY e.id) t`, params),
    db.promise().query(
      `
        SELECT ${SELECT_COLUMNS}
        ${BASE_JOIN}
        WHERE ${whereClause}
        GROUP BY e.id, e.student_id, e.course_id, e.class_id, st.name, st.registration_number, co.name, cl.name
        ORDER BY co.name ASC, st.name ASC
        LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    ),
  ]);

  const total = Number(countRows[0]?.total || 0);

  return {
    data: rows.map(mapProgressRow),
    pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
  };
}

module.exports = { listAcademicProgress };
