const { requireOwnedClass } = require("../teacher/teacherClassService");
const { createServiceError } = require("../classes/classAccessService");

function normalizePositiveId(value) {
  const normalized = Number(value);

  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

function mapStudentRow(row, activity) {
  const hasSubmission = row.submission_id !== null;

  return {
    studentId: row.student_id,
    studentName: row.student_name,
    registrationNumber: row.registration_number,
    submissionId: row.submission_id,
    status: hasSubmission ? row.submission_status : "not_submitted",
    score: row.grade_score !== null ? row.grade_score : row.submission_score,
    maxScore: activity.max_score,
    submittedAt: row.submitted_at,
    gradedAt: row.graded_at,
  };
}

/**
 * Grid de notas de uma turma para uma atividade específica —
 * planilha do professor. Sempre parte da matrícula ativa da turma
 * (LEFT JOIN até submissions/grades), então um aluno sem envio
 * aparece com submissionId nulo e status "not_submitted" — nunca
 * dá pra lançar nota dele, já que grades.submission_id é NOT NULL.
 */
async function getTeacherClassActivityGrades(db, { userId, classId, activityId }) {
  const normalizedClassId = normalizePositiveId(classId);
  const normalizedActivityId = normalizePositiveId(activityId);

  if (!normalizedClassId) {
    throw createServiceError("Selecione uma turma válida.", 400);
  }

  if (!normalizedActivityId) {
    throw createServiceError("Selecione uma atividade válida.", 400);
  }

  const runner = db.promise();

  const { classData } = await requireOwnedClass(runner, {
    userId,
    classId: normalizedClassId,
  });

  const [activityRows] = await runner.query(
    `
      SELECT id, course_id, class_id, activity_kind, title, type, max_score, status
      FROM activities
      WHERE id = ?
        AND course_id = ?
      LIMIT 1
    `,
    [normalizedActivityId, classData.course_id]
  );

  if (activityRows.length === 0) {
    throw createServiceError("Atividade não encontrada.", 404);
  }

  const activity = activityRows[0];

  if (activity.class_id !== null && Number(activity.class_id) !== normalizedClassId) {
    throw createServiceError(
      "Esta atividade não se aplica à turma selecionada.",
      404
    );
  }

  const [studentRows] = await runner.query(
    `
      SELECT
        e.student_id,
        st.name AS student_name,
        st.registration_number,

        s.id AS submission_id,
        s.status AS submission_status,
        s.score AS submission_score,
        s.submitted_at,
        s.graded_at,

        g.score AS grade_score

      FROM enrollments e

      INNER JOIN students st
        ON st.id = e.student_id
        AND st.status = 'active'

      LEFT JOIN submissions s
        ON s.student_id = e.student_id
        AND s.activity_id = ?

      LEFT JOIN grades g
        ON g.submission_id = s.id

      WHERE e.class_id = ?
        AND e.status = 'active'

      ORDER BY st.name ASC
    `,
    [normalizedActivityId, normalizedClassId]
  );

  return {
    class: { id: classData.id, name: classData.name },
    activity: {
      id: activity.id,
      title: activity.title,
      type: activity.type,
      kind: activity.activity_kind,
      maxScore: activity.max_score,
    },
    students: studentRows.map((row) => mapStudentRow(row, activity)),
  };
}

module.exports = {
  getTeacherClassActivityGrades,
};
