const { formatDateOnly, formatTimeOnly } = require("../../../utils/appConfig");

function normalizePositiveId(value) {
  const normalized = Number(value);

  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

const EVENT_GROUP_BY_TYPE = {
  holiday: "institutional",
  break: "institutional",
  recess: "institutional",
  institutional: "institutional",
  exam_week: "academic",
  academic_week: "academic",
  grade_deadline: "academic",
  enrollment: "administrative",
  re_enrollment: "administrative",
  academic_meeting: "administrative",
};

function toBasicDto(row) {
  return {
    id: `academic-event:${row.id}`,
    sourceType: "academic_event",
    sourceId: row.id,

    eventGroup: EVENT_GROUP_BY_TYPE[row.event_type] || "institutional",
    // indicatorType usa o próprio event_type: já é granular o
    // suficiente pra bater 1:1 com os filtros de segundo nível
    // (Feriados, Recessos, Matrículas, Rematrículas, Reuniões,
    // Prazos acadêmicos) sem precisar de outra tabela de tradução.
    indicatorType: row.event_type,

    title: row.title,
    description: row.description,

    startDate: formatDateOnly(row.start_date),
    endDate: formatDateOnly(row.end_date),
    startTime: formatTimeOnly(row.start_time),
    endTime: formatTimeOnly(row.end_time),
    allDay: Boolean(row.all_day),

    status: row.status === "cancelled" ? "cancelled" : "active",

    courseId: row.course_id,
    courseName: row.course_name,
    classId: row.class_id,
    className: row.class_name,

    // O próprio drawer de detalhes é o destino — não existe página
    // separada para academic_calendar_events.
    deepLink: null,
  };
}

const BASE_SELECT = `
  SELECT
    ace.id,
    ace.event_type,
    ace.title,
    ace.description,
    ace.start_date,
    ace.end_date,
    ace.all_day,
    ace.start_time,
    ace.end_time,
    ace.scope_type,
    ace.course_id,
    ace.class_id,
    ace.status,

    c.name AS course_name,
    cl.name AS class_name

  FROM academic_calendar_events ace

  LEFT JOIN courses c
    ON c.id = ace.course_id

  LEFT JOIN classes cl
    ON cl.id = ace.class_id
`;

// Overlap com o intervalo consultado: começa antes do fim do
// intervalo E (não tem fim, ou termina depois do começo do
// intervalo) — necessário porque eventos institucionais podem durar
// vários dias (recesso, semana de provas).
const DATE_OVERLAP_CONDITION =
  "ace.start_date <= ? AND (ace.end_date IS NULL OR ace.end_date >= ?)";

async function getStudentAcademicCalendarEvents(runner, { userId, from, to }) {
  const [rows] = await runner.execute(
    `
      ${BASE_SELECT}

      WHERE ace.status = 'active'
        AND ${DATE_OVERLAP_CONDITION}
        AND (
          ace.scope_type IN ('institutional', 'all_students')
          OR (
            ace.scope_type = 'course'
            AND ace.course_id IN (
              SELECT e.course_id
              FROM enrollments e
              INNER JOIN students s ON s.id = e.student_id
              WHERE s.user_id = ? AND e.status = 'active'
            )
          )
          OR (
            ace.scope_type = 'class'
            AND ace.class_id IN (
              SELECT e.class_id
              FROM enrollments e
              INNER JOIN students s ON s.id = e.student_id
              WHERE s.user_id = ? AND e.status = 'active' AND e.class_id IS NOT NULL
            )
          )
        )

      ORDER BY ace.start_date ASC
    `,
    [to, from, userId, userId]
  );

  return rows.map(toBasicDto);
}

async function getTeacherAcademicCalendarEvents(runner, { userId, from, to }) {
  const [rows] = await runner.execute(
    `
      ${BASE_SELECT}

      WHERE ace.status = 'active'
        AND ${DATE_OVERLAP_CONDITION}
        AND (
          ace.scope_type IN ('institutional', 'all_teachers')
          OR (
            ace.scope_type = 'course'
            AND ace.course_id IN (
              SELECT c2.id
              FROM courses c2
              INNER JOIN teachers t ON t.user_id = ?
              WHERE (
                EXISTS (
                  SELECT 1 FROM course_teachers ct
                  WHERE ct.course_id = c2.id AND ct.teacher_id = t.id AND ct.status = 'active'
                )
                OR c2.teacher_id = t.id
              )
            )
          )
          OR (
            ace.scope_type = 'class'
            AND ace.class_id IN (
              SELECT cl2.id
              FROM classes cl2
              INNER JOIN teachers t ON t.id = cl2.teacher_id
              WHERE t.user_id = ?
            )
          )
        )

      ORDER BY ace.start_date ASC
    `,
    [to, from, userId, userId]
  );

  return rows.map(toBasicDto);
}

async function getAdminAcademicCalendarEvents(runner, { from, to, filters = {} }) {
  const normalizedCourseId = normalizePositiveId(filters.courseId);
  const normalizedClassId = normalizePositiveId(filters.classId);

  const conditions = [DATE_OVERLAP_CONDITION];
  const params = [to, from];

  if (filters.status === "cancelled" || filters.status === "active") {
    conditions.push("ace.status = ?");
    params.push(filters.status);
  } else {
    conditions.push("ace.status IN ('active', 'cancelled')");
  }

  if (filters.scopeType) {
    conditions.push("ace.scope_type = ?");
    params.push(filters.scopeType);
  }

  if (normalizedCourseId) {
    conditions.push("ace.course_id = ?");
    params.push(normalizedCourseId);
  }

  if (normalizedClassId) {
    conditions.push("ace.class_id = ?");
    params.push(normalizedClassId);
  }

  const [rows] = await runner.execute(
    `
      ${BASE_SELECT}

      WHERE ${conditions.join(" AND ")}

      ORDER BY ace.start_date ASC
    `,
    params
  );

  return rows.map(toBasicDto);
}

async function getAcademicEventCalendarEvents(db, { role, userId, from, to, filters }) {
  const runner = db.promise();

  if (role === "student") {
    return getStudentAcademicCalendarEvents(runner, { userId, from, to });
  }

  if (role === "teacher") {
    return getTeacherAcademicCalendarEvents(runner, { userId, from, to });
  }

  return getAdminAcademicCalendarEvents(runner, { from, to, filters });
}

module.exports = { getAcademicEventCalendarEvents };
