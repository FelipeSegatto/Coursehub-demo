const {
  getStudentIdByUserId,
  createServiceError,
} = require("../classes/classAccessService");

const { loadAttendanceSummary } = require("../attendance/studentAttendanceSummaryService");

/**
 * Frequência do aluno autenticado: um bloco por matrícula com turma,
 * com resumo e a lista de encontros já lançados.
 */
async function getStudentAttendance(db, userId) {
  const studentId = await getStudentIdByUserId(db.promise(), userId);

  if (!studentId) {
    throw createServiceError("Aluno não encontrado.", 404);
  }

  const [enrollments] = await db.promise().query(
    `
      SELECT
        e.id AS enrollment_id,
        e.status AS enrollment_status,
        e.class_id,
        c.id AS course_id,
        c.name AS course_name,
        cl.name AS class_name
      FROM enrollments e
      INNER JOIN courses c ON c.id = e.course_id
      LEFT JOIN classes cl ON cl.id = e.class_id
      WHERE e.student_id = ?
        AND e.status IN ('active', 'locked', 'inactive')
      ORDER BY c.name ASC
    `,
    [studentId]
  );

  const courses = [];

  for (const enrollment of enrollments) {
    if (!enrollment.class_id) {
      courses.push({
        enrollmentId: enrollment.enrollment_id,
        enrollmentStatus: enrollment.enrollment_status,
        courseId: enrollment.course_id,
        courseName: enrollment.course_name,
        classId: null,
        className: null,
        summary: null,
        sessions: [],
      });
      continue;
    }

    const summary = await loadAttendanceSummary(db, {
      studentId,
      classId: enrollment.class_id,
    });

    const [sessions] = await db.promise().query(
      `
        SELECT
          cs.id AS session_id,
          cs.title,
          cs.session_date,
          cs.start_time,
          cs.end_time,
          cs.status AS session_status,
          att.status AS attendance_status
        FROM class_sessions cs
        LEFT JOIN attendance att
          ON att.class_session_id = cs.id AND att.student_id = ?
        WHERE cs.class_id = ?
        ORDER BY cs.session_date DESC, cs.id DESC
      `,
      [studentId, enrollment.class_id]
    );

    courses.push({
      enrollmentId: enrollment.enrollment_id,
      enrollmentStatus: enrollment.enrollment_status,
      courseId: enrollment.course_id,
      courseName: enrollment.course_name,
      classId: enrollment.class_id,
      className: enrollment.class_name,
      summary,
      sessions,
    });
  }

  return { studentId, courses };
}

module.exports = {
  getStudentAttendance,
};