/**
 * Lista os cursos atribuídos ao professor, com o total de
 * alunos com matrícula ativa em cada um.
 */
async function listTeacherCourses(db, userId) {
  const [courses] = await db.promise().query(
    `
      SELECT
        c.id, c.name, c.description, c.status, c.category, c.nivel,
        c.workload_hours, c.image_url,
        COUNT(DISTINCT e.student_id) AS total_students
      FROM teachers t
      INNER JOIN courses c ON (
        EXISTS (
          SELECT 1 FROM course_teachers ct
          WHERE ct.course_id = c.id AND ct.teacher_id = t.id AND ct.status = 'active'
        )
        OR c.teacher_id = t.id
      )
      LEFT JOIN enrollments e ON e.course_id = c.id AND e.status = 'active'
      WHERE t.user_id = ?
      GROUP BY
        c.id, c.name, c.description, c.status, c.category, c.nivel,
        c.workload_hours, c.image_url
      ORDER BY c.name ASC
    `,
    [userId]
  );

  return courses;
}

/**
 * Lista os alunos matriculados nos cursos do professor — uma
 * linha por matrícula (o mesmo aluno pode aparecer mais de uma
 * vez se estiver em mais de um curso do professor).
 */
async function listTeacherStudents(db, userId) {
  const [students] = await db.promise().query(
    `
      SELECT
        s.id AS student_id, s.user_id, s.name, s.email, s.gender,
        s.registration_number, s.status AS student_status,
        e.course_id, e.status AS enrollment_status, e.enrolled_at,
        c.name AS course_title
      FROM teachers t
      INNER JOIN courses c ON (
        EXISTS (
          SELECT 1 FROM course_teachers ct
          WHERE ct.course_id = c.id AND ct.teacher_id = t.id AND ct.status = 'active'
        )
        OR c.teacher_id = t.id
      )
      INNER JOIN enrollments e ON e.course_id = c.id
      INNER JOIN students s ON s.id = e.student_id
      WHERE t.user_id = ?
      ORDER BY s.name ASC, c.name ASC
    `,
    [userId]
  );

  return students;
}

module.exports = {
  listTeacherCourses,
  listTeacherStudents,
};
