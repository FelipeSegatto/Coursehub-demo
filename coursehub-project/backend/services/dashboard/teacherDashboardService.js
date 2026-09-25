const {
  getTeacherIdByUserId,
  createServiceError,
} = require("../classes/classAccessService");

const {
  aggregateCalendarEvents,
} = require("../calendar/calendarAggregationService");

const { formatDateOnly } = require("../../utils/appConfig");

const UPCOMING_WINDOW_DAYS = 7;
const PENDING_REVIEWS_LIMIT = 5;
const UPCOMING_SESSIONS_LIMIT = 5;
const UPCOMING_EVENTS_LIMIT = 5;

/**
 * "Aluno acompanhado pelo professor": matriculado ativamente numa
 * turma do professor, OU matriculado ativamente (sem turma
 * específica) num curso do professor. Cobre tanto o aluno alocado
 * numa turma quanto o aluno com matrícula geral, sem inventar ou
 * alterar nenhuma matrícula real — apenas amplia o critério de
 * contagem em vez de restringi-lo só a quem já tem turma.
 */
const TEACHER_STUDENT_SCOPE_JOIN = `
  INNER JOIN courses c ON c.id = e.course_id
  LEFT JOIN classes cl ON cl.id = e.class_id
`;

const TEACHER_STUDENT_SCOPE_CONDITION = `
  AND (
    EXISTS (
      SELECT 1 FROM course_teachers ct
      WHERE ct.course_id = c.id AND ct.teacher_id = ? AND ct.status = 'active'
    )
    OR c.teacher_id = ?
    OR cl.teacher_id = ?
  )
`;

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);

  return result;
}

function buildActivityDeepLink(activityKind, activityId) {
  return activityKind === "exam"
    ? `/professor/avaliacoes/${activityId}/envios`
    : `/professor/atividades/${activityId}/envios`;
}

async function countActiveClasses(db, teacherId) {
  const [rows] = await db.promise().query(
    `SELECT COUNT(*) AS count FROM classes cl
     WHERE cl.status = 'active' AND cl.teacher_id = ?`,
    [teacherId]
  );

  return Number(rows[0]?.count || 0);
}

async function countUniqueActiveStudents(db, teacherId) {
  const [rows] = await db.promise().query(
    `
      SELECT COUNT(DISTINCT e.student_id) AS count
      FROM enrollments e
      ${TEACHER_STUDENT_SCOPE_JOIN}
      WHERE e.status = 'active'
      ${TEACHER_STUDENT_SCOPE_CONDITION}
    `,
    [teacherId, teacherId, teacherId]
  );

  return Number(rows[0]?.count || 0);
}

async function countPendingReviews(db, teacherId) {
  const [rows] = await db.promise().query(
    `
      SELECT COUNT(*) AS count
      FROM submissions s
      INNER JOIN activities a ON a.id = s.activity_id
      INNER JOIN courses c ON c.id = a.course_id
      LEFT JOIN classes cl ON cl.id = a.class_id
      WHERE s.status IN ('submitted', 'pending_review')
        AND (
          EXISTS (
            SELECT 1 FROM course_teachers ct
            WHERE ct.course_id = c.id AND ct.teacher_id = ? AND ct.status = 'active'
          )
          OR c.teacher_id = ?
        )
    `,
    [teacherId, teacherId]
  );

  return Number(rows[0]?.count || 0);
}

async function listPendingReviewActivities(db, teacherId) {
  const [rows] = await db.promise().query(
    `
      SELECT
        a.id, a.title, a.activity_kind, a.due_date,
        c.name AS course_name, cl.name AS class_name,
        COUNT(s.id) AS total_submissions,
        SUM(CASE WHEN s.status IN ('submitted', 'pending_review') THEN 1 ELSE 0 END) AS pending_count
      FROM activities a
      INNER JOIN courses c ON c.id = a.course_id
      LEFT JOIN classes cl ON cl.id = a.class_id
      LEFT JOIN submissions s ON s.activity_id = a.id
      WHERE a.status = 'active'
        AND (
          EXISTS (
            SELECT 1 FROM course_teachers ct
            WHERE ct.course_id = c.id AND ct.teacher_id = ? AND ct.status = 'active'
          )
          OR c.teacher_id = ?
        )
      GROUP BY a.id, a.title, a.activity_kind, a.due_date, c.name, cl.name
      HAVING pending_count > 0
      ORDER BY
        CASE WHEN a.due_date IS NULL THEN 1 ELSE 0 END,
        a.due_date ASC
      LIMIT ${PENDING_REVIEWS_LIMIT}
    `,
    [teacherId, teacherId]
  );

  return rows.map((row) => ({
    activityId: row.id,
    title: row.title,
    activityKind: row.activity_kind,
    courseName: row.course_name,
    className: row.class_name,
    dueDate: row.due_date,
    totalSubmissions: Number(row.total_submissions || 0),
    pendingCount: Number(row.pending_count || 0),
    deepLink: buildActivityDeepLink(row.activity_kind, row.id),
  }));
}

async function listUpcomingSessions(db, teacherId) {
  const today = formatDateOnly(new Date());
  const windowEnd = formatDateOnly(addDays(new Date(), UPCOMING_WINDOW_DAYS));

  const [rows] = await db.promise().query(
    `
      SELECT
        cs.id, cs.session_date, cs.start_time, cs.end_time, cs.title, cs.status,
        cl.id AS class_id, cl.name AS class_name
      FROM class_sessions cs
      INNER JOIN classes cl ON cl.id = cs.class_id
      WHERE cl.teacher_id = ?
        AND cs.status = 'scheduled'
        AND cs.session_date BETWEEN ? AND ?
      ORDER BY cs.session_date ASC, cs.start_time ASC
      LIMIT ${UPCOMING_SESSIONS_LIMIT}
    `,
    [teacherId, today, windowEnd]
  );

  return rows.map((row) => ({
    sessionId: row.id,
    sessionDate: row.session_date,
    startTime: row.start_time,
    endTime: row.end_time,
    title: row.title,
    status: row.status,
    classId: row.class_id,
    className: row.class_name,
    deepLink: `/professor/turmas/${row.class_id}/frequencia`,
  }));
}

async function listClassesOverview(db, teacherId) {
  const [rows] = await db.promise().query(
    `
      SELECT
        cl.id, cl.name, c.name AS course_name,
        COALESCE(enrollment_stats.student_count, 0) AS student_count,
        (
          SELECT MIN(cs.session_date)
          FROM class_sessions cs
          WHERE cs.class_id = cl.id
            AND cs.status = 'scheduled'
            AND cs.session_date >= CURDATE()
        ) AS next_session_date,
        attendance_stats.present_count,
        attendance_stats.total_count
      FROM classes cl
      INNER JOIN courses c ON c.id = cl.course_id
      LEFT JOIN (
        SELECT class_id, COUNT(DISTINCT student_id) AS student_count
        FROM enrollments
        WHERE status = 'active'
        GROUP BY class_id
      ) enrollment_stats ON enrollment_stats.class_id = cl.id
      LEFT JOIN (
        SELECT cs2.class_id,
          SUM(CASE WHEN att.status = 'present' THEN 1 ELSE 0 END) AS present_count,
          COUNT(att.id) AS total_count
        FROM class_sessions cs2
        INNER JOIN attendance att ON att.class_session_id = cs2.id
        GROUP BY cs2.class_id
      ) attendance_stats ON attendance_stats.class_id = cl.id
      WHERE cl.status = 'active'
        AND cl.teacher_id = ?
      ORDER BY c.name ASC, cl.name ASC
    `,
    [teacherId]
  );

  return rows.map((row) => {
    const totalCount = Number(row.total_count || 0);
    const presentCount = Number(row.present_count || 0);

    return {
      classId: row.id,
      className: row.name,
      courseName: row.course_name,
      activeStudentCount: Number(row.student_count || 0),
      nextSessionDate: row.next_session_date,
      // Só calculada quando existe pelo menos um registro de
      // frequência real para a turma — nunca inventada como 0/100.
      averageAttendancePercentage:
        totalCount > 0 ? Number(((presentCount / totalCount) * 100).toFixed(1)) : null,
    };
  });
}

/**
 * Endpoint agregado do dashboard do professor. Executa 5 consultas
 * independentes (contagens + listas, todas com GROUP BY/agregação,
 * nenhuma em loop) mais 1 chamada ao agregador de calendário já
 * existente — todas em paralelo via Promise.all.
 */
async function getTeacherDashboard(db, userId) {
  const teacherId = await getTeacherIdByUserId(db.promise(), userId);

  if (!teacherId) {
    throw createServiceError("Professor não encontrado.", 404);
  }

  const today = formatDateOnly(new Date());
  const windowEnd = formatDateOnly(addDays(new Date(), UPCOMING_WINDOW_DAYS));

  const [
    activeClasses,
    uniqueActiveStudents,
    pendingReviewsCount,
    pendingReviews,
    upcomingSessions,
    classesOverview,
    calendarResult,
  ] = await Promise.all([
    countActiveClasses(db, teacherId),
    countUniqueActiveStudents(db, teacherId),
    countPendingReviews(db, teacherId),
    listPendingReviewActivities(db, teacherId),
    listUpcomingSessions(db, teacherId),
    listClassesOverview(db, teacherId),
    aggregateCalendarEvents(db, { role: "teacher", userId, from: today, to: windowEnd }),
  ]);

  return {
    summary: {
      activeClasses,
      uniqueActiveStudents,
      pendingReviews: pendingReviewsCount,
      upcomingCommitments: calendarResult.counts.total,
    },
    pendingReviews,
    upcomingSessions,
    classesOverview,
    upcomingEvents: calendarResult.events.slice(0, UPCOMING_EVENTS_LIMIT),
  };
}

module.exports = {
  createServiceError,
  getTeacherDashboard,
};
