const {
  getStudentIdByUserId,
  getTeacherIdByUserId,
} = require("../../classes/classAccessService");

const { formatDateOnly, formatTimeOnly } = require("../../../utils/appConfig");

function normalizePositiveId(value) {
  const normalized = Number(value);

  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

function extractTime(due_date) {
  if (!due_date) return null;

  const date = due_date instanceof Date ? due_date : new Date(due_date);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return formatTimeOnly(`${hours}:${minutes}:00`);
}

function buildDeepLink(row, { role }) {
  if (role === "teacher") {
    return row.class_id
      ? `/professor/turmas/${row.class_id}/materiais`
      : "/professor/materiais";
  }

  if (role === "admin") {
    return "/admin/materiais";
  }

  return `/aluno/dashboard-aluno/courses/${row.course_id}`;
}

function toBasicDto(row, { role }) {
  const deepLink = buildDeepLink(row, { role });

  return {
    id: `course-content:${row.id}`,
    sourceType: "course_content",
    sourceId: row.id,

    eventGroup: "learning",
    indicatorType: "course_content",

    title: row.title,
    description: row.description,

    startDate: formatDateOnly(row.due_date),
    endDate: null,
    startTime: extractTime(row.due_date),
    endTime: null,
    allDay: false,

    status: row.status === "active" ? "active" : "cancelled",

    courseId: row.course_id,
    courseName: row.course_name,
    classId: row.class_id,
    className: row.class_name,

    deepLink,
  };
}

/**
 * due_date IS NOT NULL é o único filtro necessário para excluir
 * course_contents.type='live_class' na v1 — hoje nenhuma linha
 * desse tipo tem due_date preenchido (ver análise aprovada). Não
 * há whitelist de tipo hardcoded de propósito: quando due_date
 * passar a ser usado por outro tipo, ele aparece automaticamente.
 */
const BASE_SELECT = `
  SELECT
    cc.id,
    cc.course_id,
    cc.class_id,
    cc.title,
    cc.description,
    cc.type,
    cc.due_date,
    cc.status,

    c.name AS course_name,
    cl.name AS class_name

  FROM course_contents cc

  INNER JOIN courses c
    ON c.id = cc.course_id
`;

async function getStudentCourseContentCalendarEvents(runner, { userId, from, to }) {
  const studentId = await getStudentIdByUserId(runner, userId);

  if (!studentId) return [];

  const [rows] = await runner.execute(
    `
      ${BASE_SELECT}

      INNER JOIN enrollments e
        ON e.course_id = cc.course_id
        AND e.student_id = ?
        AND e.status = 'active'

      LEFT JOIN classes cl
        ON cl.id = cc.class_id

      WHERE cc.status = 'active'
        AND cc.due_date IS NOT NULL
        AND DATE(cc.due_date) BETWEEN ? AND ?
        AND (cc.class_id IS NULL OR cc.class_id = e.class_id)

      ORDER BY cc.due_date ASC
    `,
    [studentId, from, to]
  );

  return rows.map((row) => toBasicDto(row, { role: "student" }));
}

async function getTeacherCourseContentCalendarEvents(runner, { userId, from, to }) {
  const teacherId = await getTeacherIdByUserId(runner, userId);

  if (!teacherId) return [];

  const [rows] = await runner.execute(
    `
      ${BASE_SELECT}

      LEFT JOIN classes cl
        ON cl.id = cc.class_id

      WHERE (
          EXISTS (
            SELECT 1 FROM course_teachers ct
            WHERE ct.course_id = c.id AND ct.teacher_id = ? AND ct.status = 'active'
          )
          OR c.teacher_id = ?
        )
        AND cc.status = 'active'
        AND cc.due_date IS NOT NULL
        AND DATE(cc.due_date) BETWEEN ? AND ?

      ORDER BY cc.due_date ASC
    `,
    [teacherId, teacherId, from, to]
  );

  return rows.map((row) => toBasicDto(row, { role: "teacher" }));
}

async function getAdminCourseContentCalendarEvents(runner, { from, to, filters = {} }) {
  const normalizedCourseId = normalizePositiveId(filters.courseId);
  const normalizedClassId = normalizePositiveId(filters.classId);

  const conditions = [
    "cc.status = 'active'",
    "cc.due_date IS NOT NULL",
    "DATE(cc.due_date) BETWEEN ? AND ?",
  ];
  const params = [from, to];

  if (normalizedCourseId) {
    conditions.push("cc.course_id = ?");
    params.push(normalizedCourseId);
  }

  if (normalizedClassId) {
    conditions.push("cc.class_id = ?");
    params.push(normalizedClassId);
  }

  const [rows] = await runner.execute(
    `
      ${BASE_SELECT}

      LEFT JOIN classes cl
        ON cl.id = cc.class_id

      WHERE ${conditions.join(" AND ")}

      ORDER BY cc.due_date ASC
    `,
    params
  );

  return rows.map((row) => toBasicDto(row, { role: "admin" }));
}

async function getCourseContentCalendarEvents(db, { role, userId, from, to, filters }) {
  const runner = db.promise();

  if (role === "student") {
    return getStudentCourseContentCalendarEvents(runner, { userId, from, to });
  }

  if (role === "teacher") {
    return getTeacherCourseContentCalendarEvents(runner, { userId, from, to });
  }

  return getAdminCourseContentCalendarEvents(runner, { from, to, filters });
}

module.exports = { getCourseContentCalendarEvents };
