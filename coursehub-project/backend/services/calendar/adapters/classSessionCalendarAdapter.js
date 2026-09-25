const {
  getStudentIdByUserId,
  getTeacherIdByUserId,
} = require("../../classes/classAccessService");

const { formatDateOnly, formatTimeOnly } = require("../../../utils/appConfig");

function normalizePositiveId(value) {
  const normalized = Number(value);

  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

/**
 * class_sessions.session_type nunca reclassifica o sourceType — uma
 * sessão com session_type='exam' continua sendo, para o calendário,
 * uma "class_session" comum. Não é a mesma coisa que uma avaliação
 * da tabela activities.
 */
function toBasicDto(row, { role }) {
  return {
    id: `class-session:${row.id}`,
    sourceType: "class_session",
    sourceId: row.id,

    eventGroup: "class",
    indicatorType: "class",

    title: row.title,
    description: row.description,

    startDate: formatDateOnly(row.session_date),
    endDate: null,
    startTime: formatTimeOnly(row.start_time),
    endTime: formatTimeOnly(row.end_time),
    allDay: !row.start_time,

    status: row.status === "cancelled" ? "cancelled" : "active",

    courseId: row.course_id,
    courseName: row.course_name,
    classId: row.class_id,
    className: row.class_name,

    // Não existe página de detalhe de aula do lado do aluno hoje —
    // gap documentado na arquitetura aprovada (item 20, risco 1).
    deepLink:
      role === "teacher" ? `/professor/turmas/${row.class_id}/frequencia` : null,
  };
}

const BASE_SELECT = `
  SELECT
    cs.id,
    cs.class_id,
    cs.title,
    cs.description,
    cs.session_date,
    cs.start_time,
    cs.end_time,
    cs.status,

    cl.name AS class_name,
    cl.course_id AS course_id,

    c.name AS course_name

  FROM class_sessions cs

  INNER JOIN classes cl
    ON cl.id = cs.class_id

  INNER JOIN courses c
    ON c.id = cl.course_id
`;

async function getStudentClassSessionCalendarEvents(runner, { userId, from, to }) {
  const studentId = await getStudentIdByUserId(runner, userId);

  if (!studentId) return [];

  const [rows] = await runner.execute(
    `
      ${BASE_SELECT}

      INNER JOIN enrollments e
        ON e.class_id = cs.class_id
        AND e.student_id = ?
        AND e.status = 'active'

      WHERE cs.session_date BETWEEN ? AND ?

      ORDER BY cs.session_date ASC, cs.start_time ASC
    `,
    [studentId, from, to]
  );

  return rows.map((row) => toBasicDto(row, { role: "student" }));
}

async function getTeacherClassSessionCalendarEvents(runner, { userId, from, to }) {
  const teacherId = await getTeacherIdByUserId(runner, userId);

  if (!teacherId) return [];

  const [rows] = await runner.execute(
    `
      ${BASE_SELECT}

      WHERE cl.teacher_id = ?
        AND cs.session_date BETWEEN ? AND ?

      ORDER BY cs.session_date ASC, cs.start_time ASC
    `,
    [teacherId, from, to]
  );

  return rows.map((row) => toBasicDto(row, { role: "teacher" }));
}

async function getAdminClassSessionCalendarEvents(runner, { from, to, filters = {} }) {
  const normalizedCourseId = normalizePositiveId(filters.courseId);
  const normalizedClassId = normalizePositiveId(filters.classId);

  const conditions = ["cs.session_date BETWEEN ? AND ?"];
  const params = [from, to];

  if (normalizedCourseId) {
    conditions.push("cl.course_id = ?");
    params.push(normalizedCourseId);
  }

  if (normalizedClassId) {
    conditions.push("cs.class_id = ?");
    params.push(normalizedClassId);
  }

  const [rows] = await runner.execute(
    `
      ${BASE_SELECT}

      WHERE ${conditions.join(" AND ")}

      ORDER BY cs.session_date ASC, cs.start_time ASC
    `,
    params
  );

  return rows.map((row) => toBasicDto(row, { role: "admin" }));
}

async function getClassSessionCalendarEvents(db, { role, userId, from, to, filters }) {
  const runner = db.promise();

  if (role === "student") {
    return getStudentClassSessionCalendarEvents(runner, { userId, from, to });
  }

  if (role === "teacher") {
    return getTeacherClassSessionCalendarEvents(runner, { userId, from, to });
  }

  return getAdminClassSessionCalendarEvents(runner, { from, to, filters });
}

module.exports = { getClassSessionCalendarEvents };
