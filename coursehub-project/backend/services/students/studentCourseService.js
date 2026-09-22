const {
  getStudentIdByUserId,
  createServiceError,
} = require("../classes/classAccessService");

/**
 * Lista os cursos em que o aluno possui matrícula ativa.
 */
async function listEnrolledCourses(db, userId) {
  const studentId = await getStudentIdByUserId(db.promise(), userId);

  if (!studentId) {
    throw createServiceError(
      "Perfil de aluno não encontrado para este usuário.",
      404
    );
  }

  const [courses] = await db.promise().query(
    `
      SELECT
        c.id, c.name, c.description, c.category, c.nivel,
        c.image_url, c.workload_hours,
        e.status AS enrollment_status,
        e.created_at AS enrollment_date
      FROM enrollments e
      INNER JOIN courses c ON c.id = e.course_id
      WHERE e.student_id = ? AND e.status = 'active'
      ORDER BY e.created_at DESC
    `,
    [studentId]
  );

  return courses;
}

module.exports = {
  createServiceError,
  listEnrolledCourses,
};
