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
 * Extrai "HH:mm" de um due_date DATETIME (objeto Date construído
 * pelo mysql2 no fuso local do processo) usando getters locais —
 * mesma lógica de formatDateOnly, para hora em vez de dia.
 */
function extractTime(due_date) {
  if (!due_date) return null;

  const date = due_date instanceof Date ? due_date : new Date(due_date);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return formatTimeOnly(`${hours}:${minutes}:00`);
}

function buildDeepLink(row, { role }) {
  const isExam = row.activity_kind === "exam";

  if (role === "teacher") {
    return isExam
      ? `/professor/avaliacoes/${row.id}/envios`
      : `/professor/atividades/${row.id}/envios`;
  }

  if (role === "student") {
    return isExam ? `/aluno/avaliacoes/${row.id}` : `/aluno/atividades/${row.id}`;
  }

  // Não há detalhe por ID do lado admin — leva para a listagem já
  // filtrável (ActivitiesAdmin/AssessmentsAdmin).
  return isExam ? "/admin/avaliacoes" : "/admin/atividades";
}

function toBasicDto(row, { role }) {
  return {
    id: `activity:${row.id}`,
    sourceType: "activity",
    sourceId: row.id,

    eventGroup: "learning",
    indicatorType: row.activity_kind === "exam" ? "exam" : "activity",

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

    deepLink: buildDeepLink(row, { role }),
  };
}

const BASE_SELECT = `
  SELECT
    a.id,
    a.course_id,
    a.class_id,
    a.activity_kind,
    a.title,
    a.description,
    a.due_date,
    a.status,

    c.name AS course_name,
    cl.name AS class_name

  FROM activities a

  INNER JOIN courses c
    ON c.id = a.course_id
`;

async function getStudentActivityCalendarEvents(runner, { userId, from, to }) {
  const studentId = await getStudentIdByUserId(runner, userId);

  if (!studentId) return [];

  const [rows] = await runner.execute(
    `
      ${BASE_SELECT}

      INNER JOIN enrollments e
        ON e.course_id = a.course_id
        AND e.student_id = ?
        AND e.status = 'active'

      LEFT JOIN classes cl
        ON cl.id = a.class_id

      WHERE a.status = 'active'
        AND a.due_date IS NOT NULL
        AND DATE(a.due_date) BETWEEN ? AND ?
        AND (a.class_id IS NULL OR a.class_id = e.class_id)

      ORDER BY a.due_date ASC
    `,
    [studentId, from, to]
  );

  return rows.map((row) => toBasicDto(row, { role: "student" }));
}

async function getTeacherActivityCalendarEvents(runner, { userId, from, to }) {
  const teacherId = await getTeacherIdByUserId(runner, userId);

  if (!teacherId) return [];

  const [rows] = await runner.execute(
    `
      ${BASE_SELECT}

      LEFT JOIN classes cl
        ON cl.id = a.class_id

      WHERE (
          EXISTS (
            SELECT 1 FROM course_teachers ct
            WHERE ct.course_id = c.id AND ct.teacher_id = ? AND ct.status = 'active'
          )
          OR c.teacher_id = ?
        )
        AND a.status = 'active'
        AND a.due_date IS NOT NULL
        AND DATE(a.due_date) BETWEEN ? AND ?

      ORDER BY a.due_date ASC
    `,
    [teacherId, teacherId, from, to]
  );

  return rows.map((row) => toBasicDto(row, { role: "teacher" }));
}

async function getAdminActivityCalendarEvents(runner, { from, to, filters = {} }) {
  const normalizedCourseId = normalizePositiveId(filters.courseId);
  const normalizedClassId = normalizePositiveId(filters.classId);

  const conditions = [
    "a.status = 'active'",
    "a.due_date IS NOT NULL",
    "DATE(a.due_date) BETWEEN ? AND ?",
  ];
  const params = [from, to];

  if (normalizedCourseId) {
    conditions.push("a.course_id = ?");
    params.push(normalizedCourseId);
  }

  if (normalizedClassId) {
    conditions.push("a.class_id = ?");
    params.push(normalizedClassId);
  }

  const [rows] = await runner.execute(
    `
      ${BASE_SELECT}

      LEFT JOIN classes cl
        ON cl.id = a.class_id

      WHERE ${conditions.join(" AND ")}

      ORDER BY a.due_date ASC
    `,
    params
  );

  return rows.map((row) => toBasicDto(row, { role: "admin" }));
}

/**
 * Ponto de entrada único do adapter, chamado pela
 * calendarAggregationService. Nunca escreve no banco, só traduz
 * activities já autorizadas para o DTO básico do calendário.
 */
async function getActivityCalendarEvents(db, { role, userId, from, to, filters }) {
  const runner = db.promise();

  if (role === "student") {
    return getStudentActivityCalendarEvents(runner, { userId, from, to });
  }

  if (role === "teacher") {
    return getTeacherActivityCalendarEvents(runner, { userId, from, to });
  }

  return getAdminActivityCalendarEvents(runner, { from, to, filters });
}

module.exports = { getActivityCalendarEvents };
