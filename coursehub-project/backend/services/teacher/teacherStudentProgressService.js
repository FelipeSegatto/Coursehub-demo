/**
 * Progressão dos alunos (visão professor) -- mesma lógica de negócio
 * da visão admin (adminStudentProgressService.js: mesmas regras de
 * "conteúdos considerados", mesmo cálculo de frequência, mesmo DTO de
 * detalhe), só que o universo consultável é sempre o do professor
 * autenticado, nunca a instituição inteira.
 *
 * Escopo: uma matrícula é "do professor" quando
 *   (matrícula sem turma E o curso é do professor)
 *   OU (matrícula com turma E a turma é do professor).
 * Isso cobre o caso hipotético de um curso com turmas de professores
 * diferentes sem depender só de courses.teacher_id.
 *
 * Sem filtro de status exposto (a listagem já mostra só matrículas
 * ativas, igual ao padrão inicial da visão admin) e sem busca por
 * nome -- curso e turma já bastam para um universo do tamanho das
 * turmas de um professor, então a tela carrega direto, sem exigir
 * "Aplicar filtros" antes.
 */
const {
  getTeacherIdByUserId,
  assertCourseBelongsToTeacher,
  getClassOwnedByTeacher,
  createServiceError,
} = require("../classes/classAccessService");
const { loadContentProgress, loadAttendanceSummary } = require("../admin/adminStudentProgressService");
const { mapAcademicItem, summarizeAcademicItems } = require("../students/studentProgressService");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

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

async function resolveTeacherId(db, userId) {
  const teacherId = await getTeacherIdByUserId(db.promise(), userId);

  if (!teacherId) {
    throw createServiceError("Professor não encontrado.", 404);
  }

  return teacherId;
}

function mapEnrollmentListRow(row) {
  return {
    enrollmentId: row.id,
    student: { id: row.student_id, name: row.student_name, registrationNumber: row.registration_number },
    course: { id: row.course_id, name: row.course_name },
    class: row.class_id ? { id: row.class_id, name: row.class_name } : null,
    status: row.status,
    enrolledAt: row.enrolled_at,
  };
}

function mapEnrollmentDetailRow(row) {
  return {
    id: row.id,
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

// Ramo de curso (sem turma) migrado para course_teachers, com
// courses.teacher_id legado como vínculo elegível -- 3 placeholders
// no total agora (2 no ramo de curso + 1 no ramo de turma), sempre o
// mesmo teacherId repetido, nunca valores diferentes.
const TEACHER_SCOPE_CONDITION =
  "((EXISTS (SELECT 1 FROM course_teachers ct WHERE ct.course_id = co.id AND ct.teacher_id = ? AND ct.status = 'active') OR co.teacher_id = ?) OR (e.class_id IS NOT NULL AND cl.teacher_id = ?))";

async function listEnrollmentsForProgress(db, { userId, courseId, classId, page, limit }) {
  const teacherId = await resolveTeacherId(db, userId);

  const conditions = ["e.status = 'active'", TEACHER_SCOPE_CONDITION];
  const params = [teacherId, teacherId, teacherId];

  if (courseId) {
    const normalizedCourseId = normalizeId(courseId, "ID do curso inválido.");

    await assertCourseBelongsToTeacher(db.promise(), { courseId: normalizedCourseId, teacherId });

    conditions.push("e.course_id = ?");
    params.push(normalizedCourseId);
  }

  if (classId) {
    const normalizedClassId = normalizeId(classId, "ID da turma inválido.");

    const classData = await getClassOwnedByTeacher(db.promise(), { classId: normalizedClassId, teacherId });

    if (!classData) {
      throw createServiceError("Turma não encontrada ou não vinculada ao professor.", 404);
    }

    conditions.push("e.class_id = ?");
    params.push(normalizedClassId);
  }

  const whereClause = conditions.join(" AND ");
  const { page: normalizedPage, limit: normalizedLimit, offset } = normalizePagination(page, limit);

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
      [...params, normalizedLimit, offset]
    ),
  ]);

  const total = Number(countRows[0]?.total || 0);

  return {
    data: rows.map(mapEnrollmentListRow),
    pagination: { page: normalizedPage, limit: normalizedLimit, total, totalPages: Math.max(Math.ceil(total / normalizedLimit), 1) },
  };
}

async function getOwnedEnrollmentRow(db, { userId, enrollmentId }) {
  const teacherId = await resolveTeacherId(db, userId);
  const normalizedEnrollmentId = normalizeId(enrollmentId, "ID da matrícula inválido.");

  const [rows] = await db.promise().query(
    `
      SELECT ${SELECT_COLUMNS}
      ${BASE_JOIN}
      WHERE e.id = ? AND ${TEACHER_SCOPE_CONDITION}
      LIMIT 1
    `,
    [normalizedEnrollmentId, teacherId, teacherId, teacherId]
  );

  if (rows.length === 0) {
    throw createServiceError("Matrícula não encontrada ou não vinculada ao professor.", 404);
  }

  return rows[0];
}

async function getEnrollmentProgressDetail(db, { userId, enrollmentId }) {
  const row = await getOwnedEnrollmentRow(db, { userId, enrollmentId });
  const enrollment = mapEnrollmentDetailRow(row);

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

module.exports = { listEnrollmentsForProgress, getEnrollmentProgressDetail };
