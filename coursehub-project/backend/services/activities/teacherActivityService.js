const {
  getTeacherIdByUserId,
  assertClassBelongsToCourseAndTeacher,
  createServiceError,
} = require("../classes/classAccessService");

const { resolveActivityClassScope } = require("./activityScopeService");
const { withTransaction } = require("../../utils/dbTransaction");
const { datesRepresentSameInstant } = require("../../utils/appConfig");

const { createNotificationEvent } = require("../notifications/notificationService");
const {
  resolveActiveStudentsForCourseOrClass,
} = require("../notifications/notificationRecipientResolvers");

const {
  isOptionCorrect,
  validateQuestions,
  buildQuestionStructureForDiff,
  haveQuestionsChanged,
  distributeQuestionPoints,
} = require("./activityQuestionService");

const ALLOWED_ACTIVITY_KINDS = ["activity", "exam"];
const ALLOWED_ACTIVITY_TYPES = ["mixed", "quiz", "text", "upload"];
const ALLOWED_STATUSES = ["active", "inactive", "draft", "archived"];

function normalizePositiveId(value) {
  const normalized = Number(value);

  return Number.isInteger(normalized) && normalized > 0
    ? normalized
    : null;
}

/**
 * Normaliza class_id vindo do corpo da requisição: string vazia,
 * undefined ou null viram null (atividade geral). Qualquer outro
 * valor precisa ser um inteiro positivo válido.
 */
function normalizeActivityClassId(rawClassId) {
  if (
    rawClassId === undefined ||
    rawClassId === null ||
    rawClassId === ""
  ) {
    return null;
  }

  const normalized = Number(rawClassId);

  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw createServiceError("ID da turma inválido.", 400);
  }

  return normalized;
}

/**
 * Shared by every learning.activity.* event: resolves the audience
 * inside the caller's own transaction and fires the notification
 * only if there's actually someone to tell. A course/class with no
 * actively-enrolled students is a normal case, not an error --
 * notificationService throws on zero recipients, so callers never
 * see that error as long as they go through this helper.
 */
async function notifyActivityEvent(
  db,
  connection,
  type,
  { activityId, activityKind, title, dueDate, courseId, courseName, classId, teacherUserId }
) {
  const recipients = await resolveActiveStudentsForCourseOrClass(connection, {
    courseId,
    classId,
  });

  if (recipients.length === 0) {
    return;
  }

  await createNotificationEvent(db, {
    type,
    sourceType: "activity",
    sourceId: activityId,
    actorUserId: teacherUserId,
    courseId,
    classId,
    context: {
      activityId,
      activityTitle: title,
      activityKind,
      courseId,
      courseName,
      dueDate,
      classId,
    },
    recipients,
    connection,
  });
}

function notifyActivityPublished(db, connection, params) {
  return notifyActivityEvent(db, connection, "learning.activity.published", params);
}

function notifyActivityChanged(db, connection, params) {
  return notifyActivityEvent(db, connection, "learning.activity.changed", params);
}

function notifyActivityCancelled(db, connection, params) {
  return notifyActivityEvent(db, connection, "learning.activity.cancelled", params);
}

function dueDatesDiffer(previousValue, nextValue) {
  return !datesRepresentSameInstant(previousValue, nextValue);
}

/**
 * Lista atividades e avaliações dos cursos do professor
 * autenticado, com contadores de envios.
 */
async function listTeacherActivities(db, { userId }) {
  const runner = db.promise();

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
        a.status,
        a.created_at,
        a.updated_at,

        c.name AS course_title,
        cl.name AS class_name,

        COUNT(DISTINCT sub.id) AS total_submissions,

        COUNT(
          DISTINCT CASE
            WHEN sub.status = 'pending_review'
            THEN sub.id
          END
        ) AS pending_reviews,

        COUNT(
          DISTINCT CASE
            WHEN sub.status = 'graded'
            THEN sub.id
          END
        ) AS graded_submissions

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

      LEFT JOIN submissions sub
        ON sub.activity_id = a.id

      WHERE t.user_id = ?

      GROUP BY
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
        a.status,
        a.created_at,
        a.updated_at,
        c.name,
        cl.name

      ORDER BY a.created_at DESC
    `,
    [userId]
  );

  return activities.map((activity) => ({
    ...activity,
    classId: activity.class_id,
    className: activity.class_name,
    activityScope: resolveActivityClassScope(activity.class_id),
  }));
}

/**
 * Busca uma atividade completa (questões + alternativas) para
 * edição no ActivityModal.
 */
async function getTeacherActivityDetail(db, { userId, activityId }) {
  const normalizedActivityId = normalizePositiveId(activityId);

  if (!normalizedActivityId) {
    throw createServiceError("ID da atividade inválido.", 400);
  }

  const runner = db.promise();

  const teacherId = await getTeacherIdByUserId(runner, userId);

  if (!teacherId) {
    throw createServiceError("Professor não encontrado.", 404);
  }

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
        a.order_index,
        a.is_required,
        a.status,
        a.created_at,
        a.updated_at,

        c.name AS course_title,
        cl.name AS class_name,

        COUNT(DISTINCT sub.id) AS total_submissions

      FROM activities a

      INNER JOIN courses c
        ON c.id = a.course_id

      LEFT JOIN classes cl
        ON cl.id = a.class_id

      LEFT JOIN submissions sub
        ON sub.activity_id = a.id

      WHERE a.id = ?
        AND (
          EXISTS (
            SELECT 1 FROM course_teachers ct
            WHERE ct.course_id = c.id AND ct.teacher_id = ? AND ct.status = 'active'
          )
          OR c.teacher_id = ?
        )

      GROUP BY
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
        a.status,
        a.created_at,
        a.updated_at,
        c.name,
        cl.name

      LIMIT 1
    `,
    [normalizedActivityId, teacherId, teacherId]
  );

  if (activityRows.length === 0) {
    throw createServiceError(
      "Atividade não encontrada ou não pertence ao professor.",
      404
    );
  }

  const activity = activityRows[0];

  const [questionRows] = await runner.execute(
    `
      SELECT
        id,
        activity_id,
        question_text,
        question_type,
        points,
        order_index,
        created_at,
        updated_at
      FROM activity_questions
      WHERE activity_id = ?
      ORDER BY order_index ASC, id ASC
    `,
    [normalizedActivityId]
  );

  let optionRows = [];

  if (questionRows.length > 0) {
    optionRows = (
      await runner.execute(
        `
          SELECT
            ao.id,
            ao.question_id,
            ao.option_text,
            ao.is_correct,
            ao.created_at
          FROM activity_options ao

          INNER JOIN activity_questions aq
            ON aq.id = ao.question_id

          WHERE aq.activity_id = ?

          ORDER BY
            aq.order_index ASC,
            aq.id ASC,
            ao.id ASC
        `,
        [normalizedActivityId]
      )
    )[0];
  }

  const optionsByQuestionId = new Map();

  for (const option of optionRows) {
    const questionId = Number(option.question_id);

    if (!optionsByQuestionId.has(questionId)) {
      optionsByQuestionId.set(questionId, []);
    }

    optionsByQuestionId.get(questionId).push({
      id: option.id,
      question_id: option.question_id,
      option_text: option.option_text,
      is_correct: Boolean(option.is_correct),
      created_at: option.created_at,
    });
  }

  const questions = questionRows.map((question) => ({
    id: question.id,
    activity_id: question.activity_id,
    question_text: question.question_text,
    question_type: question.question_type,
    points: Number(question.points),
    order_index: question.order_index,
    created_at: question.created_at,
    updated_at: question.updated_at,
    options: optionsByQuestionId.get(Number(question.id)) || [],
  }));

  return {
    id: activity.id,
    course_id: activity.course_id,
    course_title: activity.course_title,
    class_id: activity.class_id,
    classId: activity.class_id,
    class_name: activity.class_name,
    className: activity.class_name,
    activityScope: resolveActivityClassScope(activity.class_id),
    activity_kind: activity.activity_kind,
    title: activity.title,
    description: activity.description,
    type: activity.type,
    due_date: activity.due_date,
    max_score: Number(activity.max_score),
    order_index: activity.order_index,
    is_required: Boolean(activity.is_required),
    status: activity.status,
    created_at: activity.created_at,
    updated_at: activity.updated_at,
    total_submissions: Number(activity.total_submissions),
    questions,
  };
}

/**
 * Cria uma atividade ou avaliação com suas questões e alternativas.
 */
async function createActivity(db, { userId, payload }) {
  const {
    course_id: courseId,
    activity_kind: activityKind,
    title,
    description,
    type,
    due_date: dueDate,
    max_score: maxScore,
    status,
    questions,
  } = payload;

  const rawClassId =
    payload.class_id !== undefined ? payload.class_id : payload.classId;

  const normalizedCourseId = normalizePositiveId(courseId);
  const normalizedClassId = normalizeActivityClassId(rawClassId);

  if (!normalizedCourseId) {
    throw createServiceError("Selecione um curso válido.", 400);
  }

  if (!title?.trim()) {
    throw createServiceError("O título é obrigatório.", 400);
  }

  if (!ALLOWED_ACTIVITY_KINDS.includes(activityKind)) {
    throw createServiceError(
      "Escolha se é uma atividade ou uma prova.",
      400
    );
  }

  if (!ALLOWED_ACTIVITY_TYPES.includes(type)) {
    throw createServiceError("Formato da atividade inválido.", 400);
  }

  validateQuestions(questions);

  const normalizedMaxScore = Number(maxScore) > 0 ? Number(maxScore) : 10;
  const finalQuestionPoints = distributeQuestionPoints(questions, normalizedMaxScore);
  const normalizedStatus = status || "active";

  if (!ALLOWED_STATUSES.includes(normalizedStatus)) {
    throw createServiceError("Status da atividade inválido.", 400);
  }

  return withTransaction(db, async (connection) => {
    const [teacherRows] = await connection.query(
      `
        SELECT id
        FROM teachers
        WHERE user_id = ?
          AND status = 'active'
        LIMIT 1
      `,
      [userId]
    );

    if (teacherRows.length === 0) {
      throw createServiceError(
        "Professor não encontrado ou inativo.",
        404
      );
    }

    const teacherId = teacherRows[0].id;

    const [courseRows] = await connection.query(
      `
        SELECT id, name
        FROM courses
        WHERE id = ?
          AND status = 'active'
          AND (
            EXISTS (
              SELECT 1 FROM course_teachers ct
              WHERE ct.course_id = courses.id AND ct.teacher_id = ? AND ct.status = 'active'
            )
            OR teacher_id = ?
          )
        LIMIT 1
      `,
      [normalizedCourseId, teacherId, teacherId]
    );

    if (courseRows.length === 0) {
      throw createServiceError(
        "Você não possui permissão para cadastrar atividades neste curso.",
        403
      );
    }

    if (normalizedClassId !== null) {
      await assertClassBelongsToCourseAndTeacher(connection, {
        classId: normalizedClassId,
        courseId: normalizedCourseId,
        teacherId,
      });
    }

    const [activityResult] = await connection.query(
      `
        INSERT INTO activities
        (
          course_id,
          class_id,
          activity_kind,
          title,
          description,
          type,
          due_date,
          max_score,
          status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        normalizedCourseId,
        normalizedClassId,
        activityKind,
        title.trim(),
        description?.trim() || null,
        type,
        dueDate || null,
        normalizedMaxScore,
        normalizedStatus,
      ]
    );

    const activityId = activityResult.insertId;

    for (
      let questionIndex = 0;
      questionIndex < questions.length;
      questionIndex++
    ) {
      const question = questions[questionIndex];

      const [questionResult] = await connection.query(
        `
          INSERT INTO activity_questions
          (
            activity_id,
            question_text,
            question_type,
            points,
            order_index
          )
          VALUES (?, ?, ?, ?, ?)
        `,
        [
          activityId,
          question.question_text.trim(),
          question.question_type,
          finalQuestionPoints[questionIndex],
          questionIndex + 1,
        ]
      );

      const questionId = questionResult.insertId;

      if (question.question_type === "multiple_choice") {
        for (const option of question.options) {
          await connection.query(
            `
              INSERT INTO activity_options
              (
                question_id,
                option_text,
                is_correct
              )
              VALUES (?, ?, ?)
            `,
            [
              questionId,
              option.option_text.trim(),
              isOptionCorrect(option) ? 1 : 0,
            ]
          );
        }
      }
    }

    if (normalizedStatus === "active") {
      await notifyActivityPublished(db, connection, {
        activityId,
        activityKind,
        title: title.trim(),
        dueDate: dueDate || null,
        courseId: normalizedCourseId,
        courseName: courseRows[0].name,
        classId: normalizedClassId,
        teacherUserId: userId,
      });
    }

    return {
      message:
        activityKind === "exam"
          ? "Avaliação criada com sucesso."
          : "Atividade criada com sucesso.",

      activity: {
        id: activityId,
        course_id: normalizedCourseId,
        course_title: courseRows[0].name,
        class_id: normalizedClassId,
        classId: normalizedClassId,
        activity_kind: activityKind,
        title: title.trim(),
        description: description?.trim() || null,
        type,
        due_date: dueDate || null,
        max_score: normalizedMaxScore,
        status: normalizedStatus,
        total_submissions: 0,
        pending_reviews: 0,
        graded_submissions: 0,
      },
    };
  });
}

/**
 * Atualiza uma atividade existente, incluindo escopo de turma e,
 * quando ainda não há envios, questões e alternativas.
 */
async function updateActivity(db, { userId, activityId, payload }) {
  const normalizedActivityId = normalizePositiveId(activityId);

  if (!normalizedActivityId) {
    throw createServiceError("ID da atividade inválido.", 400);
  }

  const {
    course_id: courseId,
    activity_kind: activityKind,
    title,
    description,
    type,
    due_date: dueDate,
    max_score: maxScore,
    order_index: orderIndex,
    is_required: isRequired,
    status,
    questions,
  } = payload;

  const rawClassId =
    payload.class_id !== undefined ? payload.class_id : payload.classId;

  const normalizedCourseId = normalizePositiveId(courseId);
  const normalizedClassId = normalizeActivityClassId(rawClassId);

  if (!normalizedCourseId) {
    throw createServiceError("Selecione um curso válido.", 400);
  }

  if (!title?.trim()) {
    throw createServiceError("O título é obrigatório.", 400);
  }

  if (!ALLOWED_ACTIVITY_KINDS.includes(activityKind)) {
    throw createServiceError(
      "Escolha se o registro é uma atividade ou uma avaliação.",
      400
    );
  }

  if (!ALLOWED_ACTIVITY_TYPES.includes(type)) {
    throw createServiceError("Formato da atividade inválido.", 400);
  }

  const normalizedStatus = status || "active";

  if (!ALLOWED_STATUSES.includes(normalizedStatus)) {
    throw createServiceError("Status da atividade inválido.", 400);
  }

  const normalizedMaxScore = Number(maxScore);

  if (!Number.isFinite(normalizedMaxScore) || normalizedMaxScore <= 0) {
    throw createServiceError(
      "A nota máxima deve ser maior que zero.",
      400
    );
  }

  const normalizedOrderIndex =
    orderIndex !== undefined && orderIndex !== null && orderIndex !== ""
      ? Number(orderIndex)
      : null;

  if (
    normalizedOrderIndex !== null &&
    (!Number.isInteger(normalizedOrderIndex) || normalizedOrderIndex <= 0)
  ) {
    throw createServiceError(
      "A ordem da atividade deve ser um número inteiro maior que zero.",
      400
    );
  }

  let normalizedIsRequired = null;

  if (isRequired !== undefined && isRequired !== null) {
    normalizedIsRequired =
      isRequired === true ||
      isRequired === 1 ||
      isRequired === "1" ||
      isRequired === "true"
        ? 1
        : 0;
  }

  validateQuestions(questions);

  const finalQuestionPoints = distributeQuestionPoints(questions, normalizedMaxScore);

  return withTransaction(db, async (connection) => {
    const [teacherRows] = await connection.query(
      `
        SELECT id
        FROM teachers
        WHERE user_id = ?
        LIMIT 1
      `,
      [userId]
    );

    if (teacherRows.length === 0) {
      throw createServiceError("Professor não encontrado.", 404);
    }

    const teacherId = teacherRows[0].id;

    const [activityRows] = await connection.query(
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
          a.status,

          c.name AS course_title

        FROM activities a

        INNER JOIN courses c
          ON c.id = a.course_id

        WHERE a.id = ?
          AND (
            EXISTS (
              SELECT 1 FROM course_teachers ct
              WHERE ct.course_id = c.id AND ct.teacher_id = ? AND ct.status = 'active'
            )
            OR c.teacher_id = ?
          )

        LIMIT 1

        FOR UPDATE
      `,
      [normalizedActivityId, teacherId, teacherId]
    );

    if (activityRows.length === 0) {
      throw createServiceError(
        "Atividade não encontrada ou não pertence ao professor.",
        404
      );
    }

    const currentActivity = activityRows[0];

    if (currentActivity.activity_kind !== activityKind) {
      throw createServiceError(
        "Não é permitido transformar uma atividade em avaliação, ou uma avaliação em atividade.",
        409
      );
    }

    const [courseRows] = await connection.query(
      `
        SELECT id, name, status
        FROM courses
        WHERE id = ?
          AND (
            EXISTS (
              SELECT 1 FROM course_teachers ct
              WHERE ct.course_id = courses.id AND ct.teacher_id = ? AND ct.status = 'active'
            )
            OR teacher_id = ?
          )
        LIMIT 1
      `,
      [normalizedCourseId, teacherId, teacherId]
    );

    if (courseRows.length === 0) {
      throw createServiceError(
        "Você não possui permissão para utilizar este curso.",
        403
      );
    }

    if (normalizedClassId !== null) {
      await assertClassBelongsToCourseAndTeacher(connection, {
        classId: normalizedClassId,
        courseId: normalizedCourseId,
        teacherId,
      });
    }

    const [submissionCountRows] = await connection.query(
      `
        SELECT COUNT(*) AS total
        FROM submissions
        WHERE activity_id = ?
      `,
      [normalizedActivityId]
    );

    const totalSubmissions = Number(submissionCountRows[0].total);

    const [currentQuestionRows] = await connection.query(
      `
        SELECT id, question_text, question_type, points, order_index
        FROM activity_questions
        WHERE activity_id = ?
        ORDER BY order_index ASC, id ASC
      `,
      [normalizedActivityId]
    );

    const [currentOptionRows] = await connection.query(
      `
        SELECT ao.id, ao.question_id, ao.option_text, ao.is_correct
        FROM activity_options ao

        INNER JOIN activity_questions aq
          ON aq.id = ao.question_id

        WHERE aq.activity_id = ?

        ORDER BY
          aq.order_index ASC,
          aq.id ASC,
          ao.id ASC
      `,
      [normalizedActivityId]
    );

    const currentOptionsByQuestionId = new Map();

    for (const option of currentOptionRows) {
      const questionId = Number(option.question_id);

      if (!currentOptionsByQuestionId.has(questionId)) {
        currentOptionsByQuestionId.set(questionId, []);
      }

      currentOptionsByQuestionId.get(questionId).push({
        id: Number(option.id),
        option_text: option.option_text.trim(),
        is_correct: Boolean(option.is_correct),
      });
    }

    const currentQuestionsWithOptions = currentQuestionRows.map((question) => ({
      id: question.id,
      question_text: question.question_text,
      question_type: question.question_type,
      points: question.points,
      options:
        question.question_type === "multiple_choice"
          ? currentOptionsByQuestionId.get(Number(question.id)) || []
          : [],
    }));

    const questionsWithFinalPoints = questions.map((question, index) => ({
      ...question,
      points: finalQuestionPoints[index],
    }));

    const currentQuestionStructure = buildQuestionStructureForDiff(
      currentQuestionsWithOptions
    );
    const receivedQuestionStructure = buildQuestionStructureForDiff(
      questionsWithFinalPoints
    );

    const questionsWereChanged = haveQuestionsChanged(
      currentQuestionStructure,
      receivedQuestionStructure
    );

    if (totalSubmissions > 0 && questionsWereChanged) {
      const error = createServiceError(
        "Esta atividade já possui envios. Você pode alterar os dados gerais, mas não pode modificar questões ou alternativas.",
        409
      );

      error.extra = { total_submissions: totalSubmissions };

      throw error;
    }

    const finalOrderIndex =
      normalizedOrderIndex ?? currentActivity.order_index;

    const finalIsRequired =
      normalizedIsRequired ?? currentActivity.is_required;

    const [activityUpdateResult] = await connection.query(
      `
        UPDATE activities
        SET
          course_id = ?,
          class_id = ?,
          title = ?,
          description = ?,
          type = ?,
          due_date = ?,
          max_score = ?,
          order_index = ?,
          is_required = ?,
          status = ?,
          updated_at = NOW()
        WHERE id = ?
      `,
      [
        normalizedCourseId,
        normalizedClassId,
        title.trim(),
        description?.trim() || null,
        type,
        dueDate || null,
        normalizedMaxScore,
        finalOrderIndex,
        finalIsRequired,
        normalizedStatus,
        normalizedActivityId,
      ]
    );

    if (activityUpdateResult.affectedRows === 0) {
      throw createServiceError(
        "Não foi possível atualizar a atividade.",
        404
      );
    }

    if (totalSubmissions === 0) {
      await connection.query(
        `
          DELETE FROM activity_questions
          WHERE activity_id = ?
        `,
        [normalizedActivityId]
      );

      for (
        let questionIndex = 0;
        questionIndex < questions.length;
        questionIndex++
      ) {
        const question = questions[questionIndex];

        const [questionResult] = await connection.query(
          `
            INSERT INTO activity_questions
            (
              activity_id,
              question_text,
              question_type,
              points,
              order_index,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, NOW(), NOW())
          `,
          [
            normalizedActivityId,
            question.question_text.trim(),
            question.question_type,
            finalQuestionPoints[questionIndex],
            questionIndex + 1,
          ]
        );

        const newQuestionId = questionResult.insertId;

        if (question.question_type === "multiple_choice") {
          for (const option of question.options) {
            await connection.query(
              `
                INSERT INTO activity_options
                (
                  question_id,
                  option_text,
                  is_correct,
                  created_at
                )
                VALUES (?, ?, ?, NOW())
              `,
              [
                newQuestionId,
                option.option_text.trim(),
                isOptionCorrect(option) ? 1 : 0,
              ]
            );
          }
        }
      }
    }

    const previousClassId =
      currentActivity.class_id === null ? null : Number(currentActivity.class_id);
    const scopeChanged = previousClassId !== normalizedClassId;

    if (currentActivity.status === "draft" && normalizedStatus === "active") {
      await notifyActivityPublished(db, connection, {
        activityId: normalizedActivityId,
        activityKind,
        title: title.trim(),
        dueDate: dueDate || null,
        courseId: normalizedCourseId,
        courseName: courseRows[0].name,
        classId: normalizedClassId,
        teacherUserId: userId,
      });
    } else if (
      currentActivity.status === "active" &&
      normalizedStatus === "active" &&
      (dueDatesDiffer(currentActivity.due_date, dueDate || null) || scopeChanged)
    ) {
      await notifyActivityChanged(db, connection, {
        activityId: normalizedActivityId,
        activityKind,
        title: title.trim(),
        dueDate: dueDate || null,
        courseId: normalizedCourseId,
        courseName: courseRows[0].name,
        classId: normalizedClassId,
        teacherUserId: userId,
      });
    } else if (currentActivity.status === "active" && normalizedStatus !== "active") {
      // Same cancellation as deactivateActivity, but reached through
      // the general edit form (e.g. status set to "inactive" there
      // instead of via the dedicated deactivate endpoint) -- students
      // who could see it lose access either way, so both paths must
      // notify. Same dedup key as deactivateActivity's, so if a
      // caller somehow hits both, only one notification survives.
      await notifyActivityCancelled(db, connection, {
        activityId: normalizedActivityId,
        activityKind,
        title: title.trim(),
        dueDate: dueDate || null,
        courseId: normalizedCourseId,
        courseName: courseRows[0].name,
        classId: normalizedClassId,
        teacherUserId: userId,
      });
    }

    return {
      message:
        activityKind === "exam"
          ? "Avaliação atualizada com sucesso."
          : "Atividade atualizada com sucesso.",

      activity: {
        id: normalizedActivityId,
        course_id: normalizedCourseId,
        course_title: courseRows[0].name,
        class_id: normalizedClassId,
        classId: normalizedClassId,
        activity_kind: activityKind,
        title: title.trim(),
        description: description?.trim() || null,
        type,
        due_date: dueDate || null,
        max_score: normalizedMaxScore,
        order_index: finalOrderIndex,
        is_required: Boolean(finalIsRequired),
        status: normalizedStatus,
        total_submissions: totalSubmissions,
        questions_updated: totalSubmissions === 0,
      },
    };
  });
}

/**
 * Desativa (soft delete) uma atividade ou avaliação. Transacional
 * (não era antes) porque agora precisa nascer atomicamente com
 * learning.activity.cancelled quando a atividade estava ativa --
 * desativar um draft/archived nunca notifica (aluno nunca a viu).
 */
async function deactivateActivity(db, { userId, activityId }) {
  const normalizedActivityId = normalizePositiveId(activityId);

  if (!normalizedActivityId) {
    throw createServiceError("ID da atividade inválido.", 400);
  }

  return withTransaction(db, async (connection) => {
    const teacherId = await getTeacherIdByUserId(connection, userId);

    if (!teacherId) {
      throw createServiceError("Professor não encontrado.", 404);
    }

    const [activityRows] = await connection.query(
      `
        SELECT
          a.id,
          a.status,
          a.activity_kind,
          a.title,
          a.course_id,
          a.class_id,

          c.name AS course_name

        FROM activities a

        INNER JOIN courses c
          ON c.id = a.course_id

        WHERE a.id = ?
          AND (
            EXISTS (
              SELECT 1 FROM course_teachers ct
              WHERE ct.course_id = c.id AND ct.teacher_id = ? AND ct.status = 'active'
            )
            OR c.teacher_id = ?
          )

        LIMIT 1

        FOR UPDATE
      `,
      [normalizedActivityId, teacherId, teacherId]
    );

    if (activityRows.length === 0) {
      throw createServiceError(
        "Atividade não encontrada ou não pertence ao professor.",
        404
      );
    }

    const activity = activityRows[0];

    if (activity.status === "inactive") {
      throw createServiceError(
        activity.activity_kind === "exam"
          ? "Esta avaliação já está inativa."
          : "Esta atividade já está inativa.",
        409
      );
    }

    const wasActive = activity.status === "active";

    const [result] = await connection.query(
      `
        UPDATE activities
        SET
          status = 'inactive',
          updated_at = NOW()
        WHERE id = ?
      `,
      [normalizedActivityId]
    );

    if (result.affectedRows === 0) {
      throw createServiceError(
        activity.activity_kind === "exam"
          ? "Não foi possível desativar a avaliação."
          : "Não foi possível desativar a atividade.",
        404
      );
    }

    if (wasActive) {
      await notifyActivityCancelled(db, connection, {
        activityId: normalizedActivityId,
        activityKind: activity.activity_kind,
        title: activity.title,
        courseId: activity.course_id,
        courseName: activity.course_name,
        classId: activity.class_id,
        teacherUserId: userId,
      });
    }

    return {
      message:
        activity.activity_kind === "exam"
          ? "Avaliação desativada com sucesso."
          : "Atividade desativada com sucesso.",

      activity: {
        id: normalizedActivityId,
        status: "inactive",
      },
    };
  });
}

module.exports = {
  listTeacherActivities,
  getTeacherActivityDetail,
  createActivity,
  updateActivity,
  deactivateActivity,
};
