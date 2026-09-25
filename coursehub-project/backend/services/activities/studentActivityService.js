const {
  getStudentIdByUserId,
  createServiceError,
} = require("../classes/classAccessService");

const {
  resolveActivityClassScope,
  getStudentActivityAccess,
  getEligibleEnrollmentForActivity,
} = require("./activityScopeService");

const { createNotificationEvent } = require("../notifications/notificationService");
const { resolveTeachersForCourse } = require("../notifications/notificationRecipientResolvers");
const { assertOwnedFile } = require("../files/uploadedFileService");

function normalizePositiveId(value) {
  const normalized = Number(value);

  return Number.isInteger(normalized) && normalized > 0
    ? normalized
    : null;
}

/**
 * Lista atividades e avaliações dos cursos em que o aluno possui
 * matrícula ativa. Atividades gerais (class_id NULL) aparecem para
 * todas as turmas do curso; atividades exclusivas de turma só
 * aparecem para a matrícula da mesma turma.
 *
 * Um aluno tem no máximo uma matrícula por curso (restrição UNIQUE
 * em enrollments), então esta consulta nunca duplica atividades.
 */
async function listStudentActivities(db, { userId }) {
  const runner = db.promise();

  const studentId = await getStudentIdByUserId(runner, userId);

  if (!studentId) {
    throw createServiceError("Aluno não encontrado.", 404);
  }

  const [activities] = await runner.execute(
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
        a.order_index,
        a.is_required,
        a.status AS activity_status,
        a.created_at,
        a.updated_at,

        c.name AS course_title,
        c.name AS course_name,

        cl.name AS class_name,

        sub.id AS submission_id,
        sub.status AS submission_status,
        sub.score,
        sub.score AS grade,
        sub.feedback,
        sub.submitted_at,
        sub.graded_at,

        CASE
          WHEN sub.id IS NULL
            AND a.due_date IS NOT NULL
            AND a.due_date < NOW()
          THEN 1
          ELSE 0
        END AS is_overdue

      FROM enrollments e

      INNER JOIN courses c
        ON c.id = e.course_id

      INNER JOIN activities a
        ON a.course_id = c.id

      LEFT JOIN classes cl
        ON cl.id = a.class_id

      LEFT JOIN submissions sub
        ON sub.activity_id = a.id
        AND sub.student_id = e.student_id

      WHERE e.student_id = ?
        AND e.status = 'active'
        AND c.status = 'active'
        AND a.status = 'active'
        AND (
          a.class_id IS NULL
          OR a.class_id = e.class_id
        )

      ORDER BY
        CASE
          WHEN a.due_date IS NULL THEN 1
          ELSE 0
        END ASC,
        a.due_date ASC,
        a.created_at DESC
    `,
    [studentId]
  );

  return activities.map((activity) => ({
    ...activity,

    max_score:
      activity.max_score !== null &&
      activity.max_score !== undefined
        ? Number(activity.max_score)
        : 10,

    score:
      activity.score !== null && activity.score !== undefined
        ? Number(activity.score)
        : null,

    grade:
      activity.grade !== null && activity.grade !== undefined
        ? Number(activity.grade)
        : null,

    is_required: Boolean(activity.is_required),
    is_overdue: Boolean(activity.is_overdue),

    classId: activity.class_id,
    className: activity.class_name,
    activityScope: resolveActivityClassScope(activity.class_id),
  }));
}

/**
 * Carrega uma atividade completa (com questões e alternativas)
 * para o aluno autenticado, validando o escopo de turma antes de
 * devolver qualquer questão.
 */
async function getStudentActivityDetail(db, { userId, activityId }) {
  const normalizedActivityId = normalizePositiveId(activityId);

  if (!normalizedActivityId) {
    throw createServiceError("ID da atividade inválido.", 400);
  }

  const runner = db.promise();

  const { activity } = await getStudentActivityAccess(runner, {
    userId,
    activityId: normalizedActivityId,
  });

  /*
   * Só busca as questões depois que o acesso foi confirmado.
   */
  const [questions] = await runner.execute(
    `
      SELECT
        id,
        activity_id,
        question_text,
        question_type,
        points,
        order_index
      FROM activity_questions
      WHERE activity_id = ?
      ORDER BY order_index ASC, id ASC
    `,
    [normalizedActivityId]
  );

  let options = [];

  if (questions.length > 0) {
    const questionIds = questions.map((question) => question.id);
    const placeholders = questionIds.map(() => "?").join(", ");

    const [optionRows] = await runner.execute(
      `
        SELECT
          id,
          question_id,
          option_text
        FROM activity_options
        WHERE question_id IN (${placeholders})
        ORDER BY question_id ASC, id ASC
      `,
      questionIds
    );

    options = optionRows;
  }

  const optionsByQuestionId = options.reduce((accumulator, option) => {
    if (!accumulator[option.question_id]) {
      accumulator[option.question_id] = [];
    }

    accumulator[option.question_id].push(option);

    return accumulator;
  }, {});

  const questionsWithOptions = questions.map((question) => ({
    ...question,

    options:
      question.question_type === "multiple_choice"
        ? optionsByQuestionId[question.id] || []
        : [],
  }));

  return {
    ...activity,
    is_overdue: Boolean(
      activity.due_date && new Date(activity.due_date) < new Date()
    ),
    classId: activity.class_id,
    className: activity.class_name,
    activityScope: resolveActivityClassScope(activity.class_id),
    questions: questionsWithOptions,
  };
}

/**
 * Registra a entrega de uma atividade pelo aluno autenticado.
 * Nunca aceita a entrega apenas porque o aluno está matriculado no
 * curso — quando a atividade é exclusiva de uma turma, o aluno
 * precisa estar matriculado exatamente naquela turma.
 */
/**
 * Professor titular da turma em que o aluno enviou a atividade ou a
 * avaliação. Atividades do curso inteiro (class_id nulo) usam a turma
 * da matrícula ativa do aluno naquele curso.
 */
async function resolveSubmittingClassTeacher(runner, { courseId, studentId, classId }) {
  const [rows] = await runner.query(
    `
    SELECT u.id AS userId, u.name AS name, u.email AS email
    FROM classes cl
    INNER JOIN enrollments e
      ON e.class_id = cl.id
      AND e.student_id = ?
      AND e.status = 'active'
    INNER JOIN teachers t ON t.id = cl.teacher_id
    INNER JOIN users u ON u.id = t.user_id
    WHERE cl.course_id = ?
      AND (? IS NULL OR cl.id = ?)
      AND t.status = 'active'
      AND u.status = 'active'
    LIMIT 1
    `,
    [studentId, courseId, classId || null, classId || null]
  );

  if (!rows[0]) return null;

  return {
    userId: rows[0].userId,
    name: rows[0].name,
    email: rows[0].email,
    role: "teacher",
  };
}

async function submitActivityAnswers(
  db,
  { userId, activityId, answers, fullscreenExitCount }
) {
  const normalizedActivityId = normalizePositiveId(activityId);

  if (!normalizedActivityId) {
    throw createServiceError("ID da atividade inválido.", 400);
  }

  if (!Array.isArray(answers) || answers.length === 0) {
    throw createServiceError("Envie pelo menos uma resposta.", 400);
  }

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const studentId = await getStudentIdByUserId(connection, userId);

    if (!studentId) {
      throw createServiceError("Aluno não encontrado.", 404);
    }

    const [activityRows] = await connection.query(
      `
        SELECT
          id,
          course_id,
          class_id,
          activity_kind,
          title,
          due_date,
          status
        FROM activities
        WHERE id = ?
        LIMIT 1
      `,
      [normalizedActivityId]
    );

    if (activityRows.length === 0) {
      throw createServiceError("Atividade não encontrada.", 404);
    }

    const activity = activityRows[0];

    if (activity.status !== "active") {
      throw createServiceError(
        activity.activity_kind === "exam"
          ? "Esta avaliação não está disponível para envio."
          : "Esta atividade não está disponível para envio.",
        409
      );
    }

    if (activity.due_date && new Date(activity.due_date) < new Date()) {
      throw createServiceError(
        activity.activity_kind === "exam"
          ? "O prazo desta avaliação já foi encerrado."
          : "O prazo desta atividade já foi encerrado.",
        409
      );
    }

    /*
     * Confirma matrícula ativa no curso E, quando a atividade é
     * exclusiva de turma, que o aluno está matriculado nela.
     */
    await getEligibleEnrollmentForActivity(connection, {
      studentId,
      activity,
    });

    const [existingSubmissionRows] = await connection.query(
      `
        SELECT id
        FROM submissions
        WHERE activity_id = ?
          AND student_id = ?
        LIMIT 1
      `,
      [normalizedActivityId, studentId]
    );

    if (existingSubmissionRows.length > 0) {
      throw createServiceError(
        activity.activity_kind === "exam"
          ? "Você já enviou esta avaliação."
          : "Você já enviou esta atividade.",
        409
      );
    }

    const [questions] = await connection.query(
      `
        SELECT id, question_type, points
        FROM activity_questions
        WHERE activity_id = ?
        ORDER BY order_index ASC, id ASC
      `,
      [normalizedActivityId]
    );

    if (questions.length === 0) {
      throw createServiceError(
        "Esta atividade não possui questões.",
        400
      );
    }

    const questionMap = new Map();

    questions.forEach((question) => {
      questionMap.set(Number(question.id), question);
    });

    const receivedQuestionIds = answers.map((answer) =>
      Number(answer.question_id)
    );

    const uniqueQuestionIds = new Set(receivedQuestionIds);

    if (uniqueQuestionIds.size !== answers.length) {
      throw createServiceError(
        "Existem respostas duplicadas para a mesma questão.",
        400
      );
    }

    for (const answer of answers) {
      const questionId = Number(answer.question_id);
      const question = questionMap.get(questionId);

      if (!question) {
        throw createServiceError(
          "Uma resposta pertence a uma questão inválida.",
          400
        );
      }

      switch (question.question_type) {
        case "multiple_choice": {
          const normalizedOptionId = Number(answer.option_id);

          if (
            !Number.isInteger(normalizedOptionId) ||
            normalizedOptionId <= 0
          ) {
            throw createServiceError(
              "Todas as questões objetivas devem possuir uma alternativa.",
              400
            );
          }

          const [optionRows] = await connection.query(
            `
              SELECT id
              FROM activity_options
              WHERE id = ?
                AND question_id = ?
              LIMIT 1
            `,
            [normalizedOptionId, questionId]
          );

          if (optionRows.length === 0) {
            throw createServiceError(
              "A alternativa selecionada é inválida.",
              400
            );
          }

          break;
        }

        case "text": {
          if (!answer.answer_text?.trim()) {
            throw createServiceError(
              "Todas as questões discursivas devem ser respondidas.",
              400
            );
          }

          break;
        }

        case "upload": {
          const fileId = Number(answer.file_id);
          if (!Number.isInteger(fileId) || fileId <= 0) {
            throw createServiceError("Envie o arquivo de todas as questões de upload.", 400);
          }

          const file = await assertOwnedFile(db, {
            fileId,
            ownerUserId: userId,
            purpose: "submission",
          });

          answer.file_url = `/api/files/${file.id}`;
          break;
        }

        default: {
          throw createServiceError(
            "Tipo de questão inválido.",
            400
          );
        }
      }
    }

    const hasMissingQuestion = questions.some(
      (question) => !uniqueQuestionIds.has(Number(question.id))
    );

    if (hasMissingQuestion) {
      throw createServiceError(
        "Responda todas as questões antes de enviar.",
        400
      );
    }

    const [submissionResult] = await connection.query(
      `
        INSERT INTO submissions
        (
          activity_id,
          student_id,
          status,
          submitted_at
        )
        VALUES (?, ?, 'pending_review', NOW())
      `,
      [normalizedActivityId, studentId]
    );

    const submissionId = submissionResult.insertId;

    for (const answer of answers) {
      const normalizedQuestionId = Number(answer.question_id);

      const normalizedOptionId =
        answer.option_id !== null &&
        answer.option_id !== undefined &&
        answer.option_id !== ""
          ? Number(answer.option_id)
          : null;

      const normalizedAnswerText = answer.answer_text?.trim() || null;
      const normalizedFileUrl = answer.file_url?.trim() || null;

      await connection.query(
        `
          INSERT INTO submission_answers
          (
            submission_id,
            question_id,
            option_id,
            answer_text,
            file_url
          )
          VALUES (?, ?, ?, ?, ?)
        `,
        [
          submissionId,
          normalizedQuestionId,
          normalizedOptionId,
          normalizedAnswerText,
          normalizedFileUrl,
        ]
      );
    }

    /*
     * fullscreenExitCount não é persistido hoje — o parâmetro é
     * aceito por compatibilidade com o payload atual do frontend,
     * igual ao comportamento anterior à migração deste service.
     */
    void fullscreenExitCount;

    const teacherRecipients = await resolveTeachersForCourse(connection, {
      courseId: activity.course_id,
    });

    const classTeacher = await resolveSubmittingClassTeacher(connection, {
      courseId: activity.course_id,
      studentId,
      classId: activity.class_id,
    });

    if (classTeacher && !teacherRecipients.some((teacher) => teacher.userId === classTeacher.userId)) {
      teacherRecipients.push(classTeacher);
    }

    if (teacherRecipients.length > 0) {
      const [courseRows] = await connection.query(
        "SELECT name FROM courses WHERE id = ? LIMIT 1",
        [activity.course_id]
      );

      const [studentRows] = await connection.query(
        "SELECT name FROM students WHERE id = ? LIMIT 1",
        [studentId]
      );

      await createNotificationEvent(db, {
        type: "learning.submission.received",
        sourceType: "submission",
        sourceId: submissionId,
        actorUserId: userId,
        courseId: activity.course_id,
        classId: activity.class_id,
        context: {
          submissionId,
          activityId: normalizedActivityId,
          activityTitle: activity.title,
          activityKind: activity.activity_kind,
          studentName: studentRows[0]?.name || "Aluno",
          courseId: activity.course_id,
          courseName: courseRows[0]?.name || "",
        },
        recipients: teacherRecipients,
        connection,
      });
    }

    await connection.commit();

    return {
      message:
        activity.activity_kind === "exam"
          ? "Avaliação enviada com sucesso."
          : "Atividade enviada com sucesso.",

      submission: {
        id: submissionId,
        activity_id: normalizedActivityId,
        student_id: studentId,
        status: "pending_review",
      },
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error(
        "Erro ao desfazer a transação de envio de atividade:",
        rollbackError
      );
    }

    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  listStudentActivities,
  getStudentActivityDetail,
  submitActivityAnswers,
};
