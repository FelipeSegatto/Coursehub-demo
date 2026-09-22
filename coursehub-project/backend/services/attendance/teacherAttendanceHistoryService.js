const {
  requireOwnedClass,
} = require("../teacher/teacherClassService");

const ALLOWED_SESSION_STATUSES = ["scheduled", "completed", "cancelled", "archived"];
const ALLOWED_ATTENDANCE_STATUSES = ["complete", "pending"];

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

function mapSessionRow(row, activeEnrolledCount) {
  const recorded = Number(row.attendance_record_count || 0);
  const present = Number(row.present_count || 0);
  const absent = Number(row.absent_count || 0);
  const late = Number(row.late_count || 0);
  const excused = Number(row.excused_count || 0);

  // "Completa" = todo aluno atualmente matriculado ativamente na
  // turma já tem um registro de frequência para esta sessão. Não
  // usa class_sessions.status (que descreve se a aula aconteceu,
  // não se a chamada foi feita — são conceitos independentes,
  // confirmado no diagnóstico: hoje nenhuma sessão real tem
  // status='completed', mesmo com frequência já registrada).
  const isComplete = activeEnrolledCount > 0 && recorded >= activeEnrolledCount;

  return {
    id: row.id,
    title: row.title,
    sessionDate: row.session_date,
    startTime: row.start_time,
    endTime: row.end_time,
    sessionType: row.session_type,
    status: row.status,
    attendanceStatus: isComplete ? "complete" : "pending",
    counts: {
      total: activeEnrolledCount,
      present,
      absent,
      late,
      excused,
      unrecorded: Math.max(activeEnrolledCount - recorded, 0),
    },
    deepLink: `/professor/turmas/${row.class_id}/frequencia`,
  };
}

/**
 * Conta quantos alunos com matrícula ativa a turma tem AGORA. Não
 * existe preservação de elegibilidade histórica no schema (um aluno
 * transferido depois de uma sessão antiga não aparece retroativamente
 * como elegível daquela sessão) — limitação conhecida, documentada,
 * não resolvida nesta fase.
 */
async function getActiveEnrolledCount(runner, classId) {
  const [rows] = await runner.query(
    `
      SELECT COUNT(DISTINCT e.student_id) AS count
      FROM enrollments e
      INNER JOIN students s ON s.id = e.student_id
      WHERE e.class_id = ? AND e.status = 'active' AND s.status = 'active'
    `,
    [classId]
  );

  return Number(rows[0]?.count || 0);
}

/**
 * Histórico de chamadas de uma turma do professor autenticado —
 * classId é sempre validado por posse (requireOwnedClass), nunca
 * confiado cegamente. attendanceStatus (complete/pending) é
 * derivado comparando frequência registrada com matrícula ativa
 * atual, filtrado em memória após a query paginada (o volume por
 * página é pequeno o suficiente para não justificar um HAVING
 * dinâmico com parâmetro variável por linha).
 */
async function getTeacherAttendanceHistory(
  db,
  { userId, classId, from, to, sessionStatus, attendanceStatus, page, limit }
) {
  const normalizedClassId = Number(classId);

  if (!Number.isInteger(normalizedClassId) || normalizedClassId <= 0) {
    throw createServiceError("Selecione uma turma válida.", 400);
  }

  if (sessionStatus && !ALLOWED_SESSION_STATUSES.includes(sessionStatus)) {
    throw createServiceError("Status de sessão inválido.", 400);
  }

  if (attendanceStatus && !ALLOWED_ATTENDANCE_STATUSES.includes(attendanceStatus)) {
    throw createServiceError("Status de chamada inválido.", 400);
  }

  const runner = db.promise();

  const { classData } = await requireOwnedClass(runner, {
    userId,
    classId: normalizedClassId,
  });

  const activeEnrolledCount = await getActiveEnrolledCount(runner, normalizedClassId);

  const conditions = ["cs.class_id = ?"];
  const params = [normalizedClassId];

  if (from) {
    conditions.push("cs.session_date >= ?");
    params.push(from);
  }

  if (to) {
    conditions.push("cs.session_date <= ?");
    params.push(to);
  }

  if (sessionStatus) {
    conditions.push("cs.status = ?");
    params.push(sessionStatus);
  }

  const whereClause = conditions.join(" AND ");

  const [allRows] = await runner.query(
    `
      SELECT
        cs.id, cs.class_id, cs.title, cs.session_date, cs.start_time, cs.end_time,
        cs.session_type, cs.status,
        COUNT(a.id) AS attendance_record_count,
        SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) AS present_count,
        SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS absent_count,
        SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) AS late_count,
        SUM(CASE WHEN a.status = 'excused' THEN 1 ELSE 0 END) AS excused_count
      FROM class_sessions cs
      LEFT JOIN attendance a ON a.class_session_id = cs.id
      WHERE ${whereClause}
      GROUP BY
        cs.id, cs.class_id, cs.title, cs.session_date, cs.start_time, cs.end_time,
        cs.session_type, cs.status
      ORDER BY cs.session_date DESC, cs.start_time DESC
    `,
    params
  );

  let mappedSessions = allRows.map((row) => mapSessionRow(row, activeEnrolledCount));

  if (attendanceStatus) {
    mappedSessions = mappedSessions.filter(
      (session) => session.attendanceStatus === attendanceStatus
    );
  }

  const totalSessions = mappedSessions.length;
  const completedCalls = mappedSessions.filter(
    (session) => session.attendanceStatus === "complete"
  ).length;
  const pendingCalls = totalSessions - completedCalls;

  const totals = mappedSessions.reduce(
    (accumulator, session) => {
      accumulator.present += session.counts.present;
      accumulator.absent += session.counts.absent;
      accumulator.late += session.counts.late;
      accumulator.excused += session.counts.excused;

      return accumulator;
    },
    { present: 0, absent: 0, late: 0, excused: 0 }
  );

  const totalRecorded =
    totals.present + totals.absent + totals.late + totals.excused;

  const averageAttendanceRate =
    totalRecorded > 0
      ? Number(((totals.present / totalRecorded) * 100).toFixed(1))
      : null;

  const { page: normalizedPage, limit: normalizedLimit, offset } =
    normalizePagination(page, limit);

  const paginatedSessions = mappedSessions.slice(offset, offset + normalizedLimit);

  return {
    class: {
      id: classData.id,
      name: classData.name,
      course: {
        id: classData.course_id,
        name: classData.course_title || classData.course_name,
      },
    },
    summary: {
      totalSessions,
      completedCalls,
      pendingCalls,
      averageAttendanceRate,
      present: totals.present,
      absent: totals.absent,
      late: totals.late,
      excused: totals.excused,
    },
    sessions: paginatedSessions,
    pagination: {
      page: normalizedPage,
      limit: normalizedLimit,
      total: totalSessions,
      totalPages: Math.max(Math.ceil(totalSessions / normalizedLimit), 1),
    },
  };
}

module.exports = {
  createServiceError,
  getTeacherAttendanceHistory,
};
