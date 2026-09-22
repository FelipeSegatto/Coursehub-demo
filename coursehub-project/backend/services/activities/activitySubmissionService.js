const {
  getTeacherIdByUserId,
  assertClassBelongsToCourseAndTeacher,
  createServiceError,
} = require("../classes/classAccessService");

const {
  resolveActivityClassScope,
  validateStudentActivityScope,
} = require("./activityScopeService");

function normalizePositiveId(value) {
  const normalized = Number(value);

  return Number.isInteger(normalized) && normalized > 0
    ? normalized
    : null;
}

/**
 * Lista as entregas de uma atividade para o professor autenticado.
 *
 * Atividade exclusiva de turma: só alunos matriculados naquela
 * turma. Atividade geral: todos os alunos elegíveis do curso,
 * exceto quando um classId opcional é informado (aí filtra só
 * aquela turma, sem afetar atividades específicas).
 */
async function listActivitySubmissions(
  db,
  { userId, activityId, classId }
) {
  const normalizedActivityId = normalizePositiveId(activityId);

  if (!normalizedActivityId) {
    throw createServiceError("ID da atividade inválido.", 400);
  }

  const runner = db.promise();

  const [activityRows] = await runner.execute(
    `
      SELECT
        a.id,
        a.course_id,
        a.class_id,
        a.activity_kind,
        a.title,
        a.description,
        a.type,
        a.due_date,
        a.max_score,
        a.status,

        c.name AS course_name,
        cl.name AS class_name,

        t.id AS teacher_id

      FROM teachers t

      INNER JOIN courses c
        ON (
          EXISTS (
            SELECT 1 FROM course_teachers ct
            WHERE ct.course_id = c.id AND ct.teacher_id = t.id AND ct.status = 'active'
          )
          OR c.teacher_id = t.id
        )

      INNER JOIN activities a
        ON a.course_id = c.id

      LEFT JOIN classes cl
        ON cl.id = a.class_id

      WHERE t.user_id = ?
        AND a.id = ?

      LIMIT 1
    `,
    [userId, normalizedActivityId]
  );

  if (activityRows.length === 0) {
    throw createServiceError(
      "Atividade não encontrada ou não pertence ao professor.",
      404
    );
  }

  const activity = activityRows[0];

  /*
   * Turma que deve filtrar a listagem: sempre a da atividade,
   * quando ela for exclusiva de turma. Para atividade geral, o
   * classId opcional da query string pode ser usado — mas antes
   * precisa pertencer ao mesmo curso e ao professor autenticado.
   */
  let filterClassId = activity.class_id;

  if (activity.class_id === null && classId !== undefined && classId !== "") {
    const normalizedFilterClassId = normalizePositiveId(classId);

    if (!normalizedFilterClassId) {
      throw createServiceError("ID da turma inválido.", 400);
    }

    await assertClassBelongsToCourseAndTeacher(runner, {
      classId: normalizedFilterClassId,
      courseId: activity.course_id,
      teacherId: activity.teacher_id,
    });

    filterClassId = normalizedFilterClassId;
  }

  const params = [activity.course_id, normalizedActivityId];
  let classCondition = "";

  if (filterClassId !== null) {
    classCondition = "AND e.class_id = ?";
    params.push(filterClassId);
  }

  const [submissions] = await runner.execute(
    `
      SELECT
        s.id,
        s.activity_id,
        s.student_id,
        s.status,
        s.score,
        s.feedback,
        s.graded_by_teacher_id,
        s.submitted_at,
        s.graded_at,
        s.created_at,
        s.updated_at,

        st.name AS student_name,
        st.email AS student_email,
        st.registration_number,

        e.id AS enrollment_id,
        e.class_id AS enrollment_class_id,
        ecl.name AS enrollment_class_name,

        COUNT(sa.id) AS total_answers

      FROM submissions s

      INNER JOIN students st
        ON st.id = s.student_id

      LEFT JOIN enrollments e
        ON e.student_id = s.student_id
        AND e.course_id = ?
        AND e.status = 'active'

      LEFT JOIN classes ecl
        ON ecl.id = e.class_id

      LEFT JOIN submission_answers sa
        ON sa.submission_id = s.id

      WHERE s.activity_id = ?
        ${classCondition}

      GROUP BY
        s.id,
        s.activity_id,
        s.student_id,
        s.status,
        s.score,
        s.feedback,
        s.graded_by_teacher_id,
        s.submitted_at,
        s.graded_at,
        s.created_at,
        s.updated_at,
        st.name,
        st.email,
        st.registration_number,
        e.id,
        e.class_id,
        ecl.name

      ORDER BY
        CASE
          WHEN s.status = 'pending_review' THEN 1
          WHEN s.status = 'submitted' THEN 2
          WHEN s.status = 'returned' THEN 3
          WHEN s.status = 'graded' THEN 4
          WHEN s.status = 'draft' THEN 5
          ELSE 6
        END ASC,
        s.submitted_at ASC
    `,
    params
  );

  return {
    activity: {
      ...activity,
      classId: activity.class_id,
      className: activity.class_name,
      activityScope: resolveActivityClassScope(activity.class_id),
    },

    submissions: submissions.map((submission) => ({
      ...submission,
      enrollmentId: submission.enrollment_id,
      classId: submission.enrollment_class_id,
      className: submission.enrollment_class_name,
    })),
  };
}

/**
 * Carrega uma entrega completa para correção, confirmando que o
 * aluno dono da entrega é elegível ao escopo da atividade.
 */
async function getSubmissionFull(db, { userId, submissionId }) {
  const normalizedSubmissionId = normalizePositiveId(submissionId);

  if (!normalizedSubmissionId) {
    throw createServiceError("ID da entrega inválido.", 400);
  }

  const runner = db.promise();

  const [submissionRows] = await runner.execute(
    `
      SELECT
        s.id,
        s.activity_id,
        s.student_id,
        s.status,
        s.score,
        s.feedback,
        s.graded_by_teacher_id,
        s.submitted_at,
        s.graded_at,
        s.created_at,
        s.updated_at,

        st.name AS student_name,
        st.email AS student_email,
        st.registration_number,

        a.title AS activity_title,
        a.description AS activity_description,
        a.activity_kind,
        a.type AS activity_type,
        a.max_score,
        a.due_date,
        a.class_id,

        c.id AS course_id,
        c.name AS course_name,

        cl.name AS class_name,

        t.id AS teacher_id

      FROM submissions s

      INNER JOIN students st
        ON st.id = s.student_id

      INNER JOIN activities a
        ON a.id = s.activity_id

      INNER JOIN courses c
        ON c.id = a.course_id

      LEFT JOIN classes cl
        ON cl.id = a.class_id

      INNER JOIN teachers t
        ON t.user_id = ?

      WHERE s.id = ?
        AND (
          EXISTS (
            SELECT 1 FROM course_teachers ct
            WHERE ct.course_id = c.id AND ct.teacher_id = t.id AND ct.status = 'active'
          )
          OR c.teacher_id = t.id
        )

      LIMIT 1
    `,
    [userId, normalizedSubmissionId]
  );

  const notFoundError = createServiceError(
    "Entrega não encontrada ou não pertence ao professor.",
    404
  );

  if (submissionRows.length === 0) {
    throw notFoundError;
  }

  const submission = submissionRows[0];

  /*
   * Confirma que o aluno dono da entrega é/era elegível ao escopo
   * da atividade — evita visualizar uma submissão em contexto
   * incompatível (ex.: aluno transferido de turma).
   */
  const [enrollmentRows] = await runner.execute(
    `
      SELECT
        e.id,
        e.student_id,
        e.course_id,
        e.class_id,
        e.status,
        ecl.name AS class_name
      FROM enrollments e
      LEFT JOIN classes ecl
        ON ecl.id = e.class_id
      WHERE e.student_id = ?
        AND e.course_id = ?
      ORDER BY
        CASE WHEN e.status = 'active' THEN 0 ELSE 1 END,
        e.updated_at DESC
      LIMIT 1
    `,
    [submission.student_id, submission.course_id]
  );

  const enrollment = enrollmentRows[0] || null;

  if (
    !enrollment ||
    !validateStudentActivityScope(
      { course_id: submission.course_id, class_id: submission.class_id },
      enrollment
    )
  ) {
    throw notFoundError;
  }

  const [answers] = await runner.execute(
    `
      SELECT
        sa.id AS answer_id,
        sa.submission_id,
        sa.question_id,
        sa.option_id,
        sa.answer_text,
        sa.file_url,
        sa.is_correct,
        sa.score_awarded,
        sa.feedback AS answer_feedback,
        sa.created_at,
        sa.updated_at,

        aq.question_text,
        aq.question_type,
        aq.points AS max_points,
        aq.order_index,

        selected_option.option_text
          AS selected_option_text,

        selected_option.is_correct
          AS selected_option_is_correct

      FROM submission_answers sa

      INNER JOIN activity_questions aq
        ON aq.id = sa.question_id

      LEFT JOIN activity_options selected_option
        ON selected_option.id = sa.option_id

      WHERE sa.submission_id = ?

      ORDER BY
        aq.order_index ASC,
        aq.id ASC
    `,
    [normalizedSubmissionId]
  );

  return {
    submission: {
      ...submission,
      /*
       * classId/className refletem a turma do aluno (matrícula),
       * não a da atividade — é isso que a tela de correção precisa
       * exibir quando uma atividade geral reúne alunos de turmas
       * diferentes.
       */
      classId: enrollment.class_id,
      className: enrollment.class_name,
      activityScope: resolveActivityClassScope(submission.class_id),
    },
    answers,
  };
}

module.exports = {
  listActivitySubmissions,
  getSubmissionFull,
};
