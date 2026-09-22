/**
 * Frequência administrativa por chamada: a unidade da listagem é um
 * encontro (class_session) que já teve alguma chamada lançada, não
 * cada registro individual aluno x encontro (isso continua existindo
 * em adminAttendanceService.js, reaproveitado só pelo relatório em
 * massa -- ver services/reports/attendanceReportService.js -- não
 * pela tela).
 *
 * "Chamada lançada" = pelo menos uma linha real em attendance para
 * aquele class_session_id (INNER JOIN, nunca fabricado). O roster do
 * detalhe mostra só quem tem linha real -- nunca sintetiza "Não
 * lançado" a partir de matrículas ativas atuais, porque isso
 * reescreveria o passado se a composição da turma mudou desde a data
 * do encontro (ver services/teacher/teacherAttendanceService.js:
 * registerSessionAttendance grava só quem o professor de fato marcou,
 * então a ausência de linha é um estado real, não um bug a esconder).
 */
const { ALLOWED_ATTENDANCE_STATUSES } = require("./adminAttendanceService");

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

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDate(value, message) {
  if (!value) return null;

  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw createServiceError(message, 400);
  }

  return value;
}

const BASE_JOIN = `
  FROM class_sessions cs
  INNER JOIN classes cl ON cl.id = cs.class_id
  INNER JOIN courses co ON co.id = cl.course_id
  LEFT JOIN teachers t ON t.id = cl.teacher_id
  INNER JOIN attendance att ON att.class_session_id = cs.id
`;

function buildListFilters(filters) {
  if (!filters.classId) {
    throw createServiceError("Selecione uma turma antes de consultar a frequência.", 400);
  }

  const conditions = ["cs.class_id = ?"];
  const params = [normalizeId(filters.classId, "ID da turma inválido.")];

  const from = normalizeDate(filters.from, "A data inicial deve estar no formato YYYY-MM-DD.");
  const to = normalizeDate(filters.to, "A data final deve estar no formato YYYY-MM-DD.");

  if (from && to && from > to) {
    throw createServiceError("A data inicial não pode ser posterior à data final.", 400);
  }

  if (from) {
    conditions.push("cs.session_date >= ?");
    params.push(from);
  }

  if (to) {
    conditions.push("cs.session_date <= ?");
    params.push(to);
  }

  return { whereClause: conditions.join(" AND "), params };
}

function mapSessionRow(row) {
  return {
    sessionId: row.session_id,
    sessionNumber: row.session_number,
    title: row.title,
    sessionDate: row.session_date,
    startTime: row.start_time,
    endTime: row.end_time,
    sessionStatus: row.session_status,
    course: { id: row.course_id, name: row.course_name },
    class: { id: row.class_id, name: row.class_name },
    teacher: row.teacher_id ? { id: row.teacher_id, name: row.teacher_name } : null,
    total: Number(row.total || 0),
    present: Number(row.present || 0),
    absent: Number(row.absent || 0),
    late: Number(row.late || 0),
    excused: Number(row.excused || 0),
    adjustedCount: Number(row.adjustedCount || 0),
  };
}

/**
 * Agregado por class_session_id em SQL (GROUP BY), sem N+1 -- uma
 * consulta busca todas as chamadas + totais da turma de uma vez.
 */
async function listAttendanceSessions(db, filters = {}) {
  const { whereClause, params } = buildListFilters(filters);
  const { page, limit, offset } = normalizePagination(filters.page, filters.limit);

  const [[countRows], [rows]] = await Promise.all([
    db.promise().query(
      `SELECT COUNT(*) AS total FROM (SELECT cs.id ${BASE_JOIN} WHERE ${whereClause} GROUP BY cs.id) t`,
      params
    ),
    db.promise().query(
      `
        SELECT
          cs.id AS session_id, cs.session_number, cs.title, cs.session_date,
          cs.start_time, cs.end_time, cs.status AS session_status,
          co.id AS course_id, co.name AS course_name,
          cl.id AS class_id, cl.name AS class_name,
          t.id AS teacher_id, t.name AS teacher_name,
          COUNT(att.id) AS total,
          SUM(CASE WHEN att.status = 'present' THEN 1 ELSE 0 END) AS present,
          SUM(CASE WHEN att.status = 'absent' THEN 1 ELSE 0 END) AS absent,
          SUM(CASE WHEN att.status = 'late' THEN 1 ELSE 0 END) AS late,
          SUM(CASE WHEN att.status = 'excused' THEN 1 ELSE 0 END) AS excused,
          SUM(CASE WHEN att.admin_adjusted_at IS NOT NULL THEN 1 ELSE 0 END) AS adjustedCount
        ${BASE_JOIN}
        WHERE ${whereClause}
        GROUP BY cs.id, cs.session_number, cs.title, cs.session_date, cs.start_time, cs.end_time,
                 cs.status, co.id, co.name, cl.id, cl.name, t.id, t.name
        ORDER BY cs.session_date DESC, cs.session_number DESC
        LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    ),
  ]);

  const total = Number(countRows[0]?.total || 0);

  return {
    data: rows.map(mapSessionRow),
    pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
  };
}

/**
 * Detalhe de UMA chamada -- roster mostra só alunos com linha real em
 * attendance para este encontro (nunca sintetiza "Não lançado" a
 * partir da matrícula atual, ver comentário no topo do arquivo).
 */
async function getAttendanceSessionDetail(db, sessionId) {
  const normalizedSessionId = normalizeId(sessionId, "ID do encontro inválido.");

  const [sessionRows] = await db.promise().query(
    `
      SELECT
        cs.id AS session_id, cs.session_number, cs.title, cs.session_date,
        cs.start_time, cs.end_time, cs.status AS session_status,
        co.id AS course_id, co.name AS course_name,
        cl.id AS class_id, cl.name AS class_name,
        t.id AS teacher_id, t.name AS teacher_name
      FROM class_sessions cs
      INNER JOIN classes cl ON cl.id = cs.class_id
      INNER JOIN courses co ON co.id = cl.course_id
      LEFT JOIN teachers t ON t.id = cl.teacher_id
      WHERE cs.id = ?
      LIMIT 1
    `,
    [normalizedSessionId]
  );

  if (sessionRows.length === 0) {
    throw createServiceError("Encontro não encontrado.", 404);
  }

  const [studentRows] = await db.promise().query(
    `
      SELECT
        att.id, att.status, att.notes,
        att.admin_adjusted_at, att.admin_adjusted_by_user_id, att.admin_adjustment_reason, att.previous_status,
        st.id AS student_id, st.name AS student_name, st.registration_number,
        adj_u.name AS admin_adjusted_by_name
      FROM attendance att
      INNER JOIN students st ON st.id = att.student_id
      LEFT JOIN users adj_u ON adj_u.id = att.admin_adjusted_by_user_id
      WHERE att.class_session_id = ?
      ORDER BY st.name ASC
    `,
    [normalizedSessionId]
  );

  const students = studentRows.map((row) => ({
    attendanceId: row.id,
    student: { id: row.student_id, name: row.student_name, registrationNumber: row.registration_number },
    status: row.status,
    notes: row.notes,
    adjustment:
      row.admin_adjusted_at !== null
        ? {
            adjustedAt: row.admin_adjusted_at,
            adjustedBy: row.admin_adjusted_by_user_id
              ? { id: row.admin_adjusted_by_user_id, name: row.admin_adjusted_by_name }
              : null,
            reason: row.admin_adjustment_reason,
            previousStatus: row.previous_status,
          }
        : null,
  }));

  const summary = {
    total: students.length,
    present: students.filter((s) => s.status === "present").length,
    absent: students.filter((s) => s.status === "absent").length,
    late: students.filter((s) => s.status === "late").length,
    excused: students.filter((s) => s.status === "excused").length,
    adjustedCount: students.filter((s) => s.adjustment !== null).length,
  };

  const sessionRow = sessionRows[0];

  return {
    session: {
      id: sessionRow.session_id,
      sessionNumber: sessionRow.session_number,
      title: sessionRow.title,
      sessionDate: sessionRow.session_date,
      startTime: sessionRow.start_time,
      endTime: sessionRow.end_time,
      status: sessionRow.session_status,
      course: { id: sessionRow.course_id, name: sessionRow.course_name },
      class: { id: sessionRow.class_id, name: sessionRow.class_name },
      teacher: sessionRow.teacher_id ? { id: sessionRow.teacher_id, name: sessionRow.teacher_name } : null,
    },
    summary,
    students,
  };
}

module.exports = { createServiceError, listAttendanceSessions, getAttendanceSessionDetail, ALLOWED_ATTENDANCE_STATUSES };
