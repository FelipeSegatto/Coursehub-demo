/**
 * Progressão dos alunos (visão admin) -- duas responsabilidades bem
 * separadas por custo:
 *
 * listEnrollmentsForProgress: listagem leve, uma linha por matrícula
 * (o mesmo aluno aparece mais de uma vez se tiver mais de uma
 * matrícula) -- só o suficiente pra identificar a matrícula e abrir o
 * detalhe. Nunca calcula progresso aqui.
 *
 * getEnrollmentProgressDetail: cálculo completo de UMA matrícula,
 * reaproveitando as mesmas regras de content/academic progress que o
 * aluno já vê em studentProgressService.js (mapAcademicItem,
 * summarizeAcademicItems) -- a diretora nunca deve ver um número
 * diferente do que o aluno vê. Frequência só entra quando a matrícula
 * tem turma definida (sem isso não há como escopar sessão/presença
 * sem ambiguidade).
 *
 * Nenhuma das duas exige financial_contracts -- uma matrícula ativa
 * pode existir sem contrato (migração, bolsa, regra administrativa).
 */
const { getEnrollmentById, ALLOWED_ENROLLMENT_STATUSES } = require("./adminEnrollmentService");
const { CONTENT_TYPES } = require("../courseContents/courseContentScopeService");
const { mapAcademicItem, summarizeAcademicItems } = require("../students/studentProgressService");
const { loadAttendanceSummary } = require("../attendance/studentAttendanceSummaryService");

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

function mapEnrollmentProgressRow(row) {
  return {
    enrollmentId: row.id,
    student: { id: row.student_id, name: row.student_name, registrationNumber: row.registration_number },
    course: { id: row.course_id, name: row.course_name },
    class: row.class_id ? { id: row.class_id, name: row.class_name } : null,
    status: row.status,
    enrolledAt: row.enrolled_at,
  };
}

const BASE_JOIN = `
  FROM enrollments e
  INNER JOIN students s ON s.id = e.student_id
  INNER JOIN courses co ON co.id = e.course_id
  LEFT JOIN classes cl ON cl.id = e.class_id
`;

const SELECT_COLUMNS = `
  e.id, e.status, e.enrolled_at,
  s.id AS student_id, s.name AS student_name, s.registration_number,
  co.id AS course_id, co.name AS course_name,
  cl.id AS class_id, cl.name AS class_name
`;

/**
 * Sem filtro de status explícito, mostra só matrículas ativas -- a
 * visão inicial não deve ficar poluída por canceladas/inativas.
 * status="all" mostra todas; qualquer valor do enum mostra
 * exatamente aquele status.
 */
/**
 * status da matrícula sozinho é cosmético (troca o recorte de um
 * universo já institucional pra outro) -- exige curso, turma ou uma
 * busca com pelo menos 3 caracteres antes de liberar a consulta.
 */
function hasValidScope(filters) {
  const search = filters.search?.trim() || "";

  return Boolean(filters.courseId || filters.classId || search.length >= 3);
}

function buildListFilters(filters) {
  if (!hasValidScope(filters)) {
    throw createServiceError(
      "Selecione ao menos curso, turma ou busque por pelo menos 3 caracteres antes de consultar.",
      400
    );
  }

  const conditions = ["1 = 1"];
  const params = [];

  const search = filters.search?.trim();

  if (search) {
    conditions.push("(s.name LIKE ? OR s.registration_number LIKE ? OR co.name LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (filters.courseId) {
    conditions.push("e.course_id = ?");
    params.push(normalizeId(filters.courseId, "ID do curso inválido."));
  }

  if (filters.classId) {
    conditions.push("e.class_id = ?");
    params.push(normalizeId(filters.classId, "ID da turma inválido."));
  }

  if (!filters.status) {
    conditions.push("e.status = 'active'");
  } else if (filters.status !== "all") {
    if (!ALLOWED_ENROLLMENT_STATUSES.includes(filters.status)) {
      throw createServiceError("Status de matrícula inválido.", 400);
    }

    conditions.push("e.status = ?");
    params.push(filters.status);
  }

  return { whereClause: conditions.join(" AND "), params };
}

async function listEnrollmentsForProgress(db, filters = {}) {
  const { whereClause, params } = buildListFilters(filters);
  const { page, limit, offset } = normalizePagination(filters.page, filters.limit);

  const [[countRows], [rows]] = await Promise.all([
    db.promise().query(`SELECT COUNT(*) AS total ${BASE_JOIN} WHERE ${whereClause}`, params),
    db.promise().query(
      `
        SELECT ${SELECT_COLUMNS}
        ${BASE_JOIN}
        WHERE ${whereClause}
        ORDER BY s.name ASC, co.name ASC
        LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    ),
  ]);

  const total = Number(countRows[0]?.total || 0);

  return {
    data: rows.map(mapEnrollmentProgressRow),
    pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
  };
}

/**
 * Conteúdos visíveis à matrícula: geral (class_id NULL) ou da mesma
 * turma. Sem exigir status='active' na matrícula -- a diretora deve
 * conseguir abrir o detalhe de uma matrícula concluída/cancelada
 * também, só o cálculo de "considerados" que segue a mesma regra do
 * aluno (obrigatórios, ou todos se nenhum for obrigatório).
 */
async function loadContentProgress(db, { studentId, courseId, classId }) {
  const [rows] = await db.promise().query(
    `
      SELECT
        cc.id AS content_id, cc.title, cc.type, cc.is_required, cc.order_index,
        scp.status AS progress_status, scp.progress_percentage, scp.last_accessed_at
      FROM course_contents cc
      LEFT JOIN student_content_progress scp
        ON scp.content_id = cc.id AND scp.student_id = ?
      WHERE cc.course_id = ?
        AND cc.status = 'active'
        AND cc.type IN (${CONTENT_TYPES.map(() => "?").join(", ")})
        AND (cc.class_id IS NULL OR cc.class_id = ?)
      ORDER BY cc.order_index ASC, cc.id ASC
    `,
    [studentId, courseId, ...CONTENT_TYPES, classId]
  );

  const contents = rows.map((row) => ({
    contentId: row.content_id,
    title: row.title,
    type: row.type,
    isRequired: Boolean(row.is_required),
    progressStatus: row.progress_status || "not_started",
    progressPercentage: row.progress_percentage !== null ? Number(row.progress_percentage) : 0,
    lastAccessedAt: row.last_accessed_at,
  }));

  const requiredContents = contents.filter((content) => content.isRequired);
  const contentsForProgress = requiredContents.length > 0 ? requiredContents : contents;

  const totalContents = contentsForProgress.length;
  const completedContents = contentsForProgress.filter((c) => c.progressStatus === "completed").length;
  const inProgressContents = contentsForProgress.filter((c) => c.progressStatus === "in_progress").length;
  const notStartedContents = totalContents - completedContents - inProgressContents;

  // Curso sem conteúdo acompanhável: percentual nulo, nunca um falso
  // 0% (0% sugeriria "começou e não concluiu nada", o que é diferente
  // de "não há nada pra concluir aqui").
  const progressPercentage =
    totalContents > 0 ? Number(((completedContents / totalContents) * 100).toFixed(2)) : null;

  return {
    summary: { totalContents, completedContents, inProgressContents, notStartedContents, progressPercentage },
    contents: contentsForProgress,
  };
}

async function getEnrollmentProgressDetail(db, enrollmentId) {
  const normalizedEnrollmentId = normalizeId(enrollmentId, "ID da matrícula inválido.");

  const enrollment = await getEnrollmentById(db, normalizedEnrollmentId);

  const [contentProgress, academicRows, attendance] = await Promise.all([
    loadContentProgress(db, {
      studentId: enrollment.student.id,
      courseId: enrollment.course.id,
      classId: enrollment.class?.id || null,
    }),
    db.promise().query(
      `
        SELECT
          a.id AS activity_id, a.course_id, a.activity_kind, a.title,
          a.description, a.type, a.due_date, a.max_score, a.order_index,
          a.is_required, a.status AS activity_status,
          sub.id AS submission_id, sub.status AS submission_status,
          sub.score, sub.feedback, sub.submitted_at, sub.graded_at,
          CASE
            WHEN sub.id IS NULL AND a.due_date IS NOT NULL AND a.due_date < NOW()
            THEN 1 ELSE 0
          END AS is_overdue
        FROM activities a
        LEFT JOIN submissions sub
          ON sub.activity_id = a.id AND sub.student_id = ?
        WHERE a.course_id = ? AND a.status = 'active'
        ORDER BY
          CASE WHEN a.due_date IS NULL THEN 1 ELSE 0 END ASC,
          a.due_date ASC, a.order_index ASC, a.id ASC
      `,
      [enrollment.student.id, enrollment.course.id]
    ),
    loadAttendanceSummary(db, { studentId: enrollment.student.id, classId: enrollment.class?.id || null }),
  ]);

  const academicItems = academicRows[0].map(mapAcademicItem);
  const activityItems = academicItems.filter((item) => item.activity_kind === "activity");
  const examItems = academicItems.filter((item) => item.activity_kind === "exam");

  return {
    enrollment,
    contentSummary: contentProgress.summary,
    contents: contentProgress.contents,
    academicSummary: summarizeAcademicItems(academicItems),
    byKind: {
      activities: summarizeAcademicItems(activityItems),
      exams: summarizeAcademicItems(examItems),
    },
    academicItems,
    attendance,
  };
}

module.exports = {
  createServiceError,
  hasValidScope,
  listEnrollmentsForProgress,
  getEnrollmentProgressDetail,
  loadContentProgress,
  loadAttendanceSummary,
};
