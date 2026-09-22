const { validateClassBelongsToCourse } = require("../activities/activityScopeService");

const {
  validateQuestions,
  buildQuestionStructureForDiff,
  haveQuestionsChanged,
  distributeQuestionPoints,
} = require("../activities/activityQuestionService");

const ALLOWED_ACTIVITY_TYPES = ["mixed", "quiz", "text", "upload"];
const ALLOWED_STATUSES = ["active", "inactive", "draft", "archived"];

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

function normalizePagination(page, limit) {
  const normalizedPage =
    Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : DEFAULT_PAGE;

  const normalizedLimit =
    Number.isInteger(Number(limit)) && Number(limit) > 0
      ? Math.min(Number(limit), MAX_LIMIT)
      : DEFAULT_LIMIT;

  return {
    page: normalizedPage,
    limit: normalizedLimit,
    offset: (normalizedPage - 1) * normalizedLimit,
  };
}

function normalizeId(value, message) {
  const normalized = Number(value);

  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw createServiceError(message, 400);
  }

  return normalized;
}

function mapActivityRow(row) {
  return {
    id: row.id,
    activityKind: row.activity_kind,
    title: row.title,
    description: row.description,
    type: row.type,
    course: { id: row.course_id, name: row.course_name },
    class: row.class_id ? { id: row.class_id, name: row.class_name } : null,
    teacher: row.teacher_id ? { id: row.teacher_id, name: row.teacher_name } : null,
    scopeLabel: row.class_id ? row.class_name : "Geral",
    dueDate: row.due_date,
    maxScore: Number(row.max_score),
    orderIndex: row.order_index,
    isRequired: Boolean(row.is_required),
    status: row.status,
    questionCount: Number(row.question_count || 0),
    submissionCounts: {
      total: Number(row.sub_total || 0),
      pendingReview: Number(row.sub_pending || 0),
      graded: Number(row.sub_graded || 0),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const BASE_JOIN = `
  FROM activities a
  INNER JOIN courses co ON co.id = a.course_id
  LEFT JOIN classes cl ON cl.id = a.class_id
  LEFT JOIN teachers t ON t.id = co.teacher_id
`;

const AGGREGATE_JOIN = `
  LEFT JOIN (
    SELECT activity_id, COUNT(*) AS question_count
    FROM activity_questions
    GROUP BY activity_id
  ) qc ON qc.activity_id = a.id
  LEFT JOIN (
    SELECT
      activity_id,
      COUNT(*) AS total,
      SUM(CASE WHEN status IN ('submitted', 'pending_review') THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'graded' THEN 1 ELSE 0 END) AS graded
    FROM submissions
    GROUP BY activity_id
  ) sc ON sc.activity_id = a.id
`;

const SELECT_COLUMNS = `
  a.id, a.activity_kind, a.title, a.description, a.type, a.due_date, a.max_score,
  a.order_index, a.is_required, a.status, a.created_at, a.updated_at,
  co.id AS course_id, co.name AS course_name,
  cl.id AS class_id, cl.name AS class_name,
  t.id AS teacher_id, t.name AS teacher_name,
  COALESCE(qc.question_count, 0) AS question_count,
  COALESCE(sc.total, 0) AS sub_total,
  COALESCE(sc.pending, 0) AS sub_pending,
  COALESCE(sc.graded, 0) AS sub_graded
`;

function buildListFilters(activityKind, filters) {
  const conditions = ["a.activity_kind = ?"];
  const params = [activityKind];

  const search = filters.search?.trim();

  if (search) {
    conditions.push("(a.title LIKE ? OR co.name LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  if (filters.courseId) {
    conditions.push("a.course_id = ?");
    params.push(normalizeId(filters.courseId, "ID do curso inválido."));
  }

  if (filters.classId) {
    conditions.push("a.class_id = ?");
    params.push(normalizeId(filters.classId, "ID da turma inválido."));
  }

  if (filters.teacherId) {
    conditions.push("co.teacher_id = ?");
    params.push(normalizeId(filters.teacherId, "ID do professor inválido."));
  }

  if (filters.status) {
    if (!ALLOWED_STATUSES.includes(filters.status)) {
      throw createServiceError("Status inválido.", 400);
    }

    conditions.push("a.status = ?");
    params.push(filters.status);
  }

  if (filters.type) {
    if (!ALLOWED_ACTIVITY_TYPES.includes(filters.type)) {
      throw createServiceError("Tipo inválido.", 400);
    }

    conditions.push("a.type = ?");
    params.push(filters.type);
  }

  if (filters.scope === "general") {
    conditions.push("a.class_id IS NULL");
  } else if (filters.scope === "class_specific") {
    conditions.push("a.class_id IS NOT NULL");
  }

  if (filters.from) {
    conditions.push("a.due_date >= ?");
    params.push(`${filters.from} 00:00:00`);
  }

  if (filters.to) {
    conditions.push("a.due_date <= ?");
    params.push(`${filters.to} 23:59:59`);
  }

  return { whereClause: conditions.join(" AND "), params };
}

async function getActivitiesSummary(db, activityKind) {
  const [rows] = await db.promise().query(
    `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'active' AND due_date IS NOT NULL
          AND due_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)
          THEN 1 ELSE 0 END) AS due_soon,
        SUM(CASE WHEN class_id IS NULL THEN 1 ELSE 0 END) AS general,
        SUM(CASE WHEN class_id IS NOT NULL THEN 1 ELSE 0 END) AS class_specific,
        SUM(CASE WHEN status = 'active' AND due_date IS NOT NULL AND due_date < NOW()
          THEN 1 ELSE 0 END) AS closed,
        (
          SELECT COUNT(*)
          FROM submissions sub
          INNER JOIN activities a2 ON a2.id = sub.activity_id
          WHERE a2.activity_kind = ? AND sub.status IN ('submitted', 'pending_review')
        ) AS pending_reviews,
        (
          SELECT COUNT(*)
          FROM submissions sub
          INNER JOIN activities a2 ON a2.id = sub.activity_id
          WHERE a2.activity_kind = ? AND sub.status = 'graded'
        ) AS graded
      FROM activities
      WHERE activity_kind = ?
    `,
    [activityKind, activityKind, activityKind]
  );

  const row = rows[0] || {};

  return {
    total: Number(row.total || 0),
    active: Number(row.active || 0),
    dueSoon: Number(row.due_soon || 0),
    general: Number(row.general || 0),
    classSpecific: Number(row.class_specific || 0),
    closed: Number(row.closed || 0),
    pendingReviews: Number(row.pending_reviews || 0),
    graded: Number(row.graded || 0),
  };
}

async function listActivities(db, activityKind, filters = {}) {
  const { whereClause, params } = buildListFilters(activityKind, filters);
  const { page, limit, offset } = normalizePagination(filters.page, filters.limit);

  const [summary, [countRows], [rows]] = await Promise.all([
    getActivitiesSummary(db, activityKind),
    db.promise().query(`SELECT COUNT(*) AS total ${BASE_JOIN} WHERE ${whereClause}`, params),
    db.promise().query(
      `
        SELECT ${SELECT_COLUMNS}
        ${BASE_JOIN}
        ${AGGREGATE_JOIN}
        WHERE ${whereClause}
        ORDER BY a.created_at DESC
        LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    ),
  ]);

  const total = Number(countRows[0]?.total || 0);

  return {
    data: rows.map(mapActivityRow),
    summary,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  };
}

/**
 * Detalhe completo, incluindo questões/alternativas. Sempre
 * filtrado por activity_kind — um ID de exam nunca aparece pela
 * rota de activities, e vice-versa (404 genérico, sem revelar que
 * o registro existe com o outro kind).
 */
async function getActivityById(db, activityKind, id) {
  const activityId = normalizeId(id, "ID inválido.");

  const [rows] = await db.promise().query(
    `
      SELECT ${SELECT_COLUMNS}
      ${BASE_JOIN}
      ${AGGREGATE_JOIN}
      WHERE a.id = ? AND a.activity_kind = ?
      LIMIT 1
    `,
    [activityId, activityKind]
  );

  if (rows.length === 0) {
    throw createServiceError("Registro não encontrado.", 404);
  }

  const activity = mapActivityRow(rows[0]);

  const [questionRows] = await db.promise().query(
    `
      SELECT id, question_text, question_type, points, order_index
      FROM activity_questions
      WHERE activity_id = ?
      ORDER BY order_index ASC, id ASC
    `,
    [activityId]
  );

  let optionRows = [];

  if (questionRows.length > 0) {
    [optionRows] = await db.promise().query(
      `
        SELECT ao.id, ao.question_id, ao.option_text, ao.is_correct
        FROM activity_options ao
        INNER JOIN activity_questions aq ON aq.id = ao.question_id
        WHERE aq.activity_id = ?
        ORDER BY aq.order_index ASC, aq.id ASC, ao.id ASC
      `,
      [activityId]
    );
  }

  const optionsByQuestionId = new Map();

  for (const option of optionRows) {
    const questionId = Number(option.question_id);

    if (!optionsByQuestionId.has(questionId)) {
      optionsByQuestionId.set(questionId, []);
    }

    optionsByQuestionId.get(questionId).push({
      id: option.id,
      option_text: option.option_text,
      is_correct: Boolean(option.is_correct),
    });
  }

  activity.questions = questionRows.map((question) => ({
    id: question.id,
    question_text: question.question_text,
    question_type: question.question_type,
    points: Number(question.points),
    order_index: question.order_index,
    options: optionsByQuestionId.get(Number(question.id)) || [],
  }));

  return activity;
}

/**
 * Impacto antes de editar/excluir estruturalmente: quantas
 * submissões e notas já existem.
 */
async function getActivityImpact(runner, activityId) {
  const [[submissionRows], [gradeRows]] = await Promise.all([
    runner.query(`SELECT COUNT(*) AS count FROM submissions WHERE activity_id = ?`, [
      activityId,
    ]),
    runner.query(`SELECT COUNT(*) AS count FROM grades WHERE activity_id = ?`, [
      activityId,
    ]),
  ]);

  return {
    totalSubmissions: Number(submissionRows[0]?.count || 0),
    totalGrades: Number(gradeRows[0]?.count || 0),
  };
}

async function getActivityImpactById(db, activityKind, id) {
  const activityId = normalizeId(id, "ID inválido.");

  const [rows] = await db
    .promise()
    .query(`SELECT id FROM activities WHERE id = ? AND activity_kind = ? LIMIT 1`, [
      activityId,
      activityKind,
    ]);

  if (rows.length === 0) {
    throw createServiceError("Registro não encontrado.", 404);
  }

  return getActivityImpact(db.promise(), activityId);
}

/**
 * Cria uma atividade/avaliação com suas questões e alternativas.
 * activityKind é sempre injetado pela rota chamadora (nunca lido
 * do corpo da requisição) — impede o cliente de manipular o kind.
 */
async function createActivity(db, activityKind, payload) {
  const {
    course_id: courseId,
    title,
    description,
    type,
    due_date: dueDate,
    max_score: maxScore,
    status,
    questions,
  } = payload;

  const rawClassId = payload.class_id !== undefined ? payload.class_id : payload.classId;

  const normalizedCourseId = normalizeId(courseId, "Curso é obrigatório e deve ser válido.");
  const normalizedClassId =
    rawClassId !== undefined && rawClassId !== null && rawClassId !== ""
      ? normalizeId(rawClassId, "ID da turma inválido.")
      : null;

  if (!title?.trim()) {
    throw createServiceError("O título é obrigatório.", 400);
  }

  if (!ALLOWED_ACTIVITY_TYPES.includes(type)) {
    throw createServiceError("Formato inválido.", 400);
  }

  validateQuestions(questions);

  const normalizedMaxScore = Number(maxScore) > 0 ? Number(maxScore) : 10;
  const finalQuestionPoints = distributeQuestionPoints(questions, normalizedMaxScore);
  const normalizedStatus = status || "active";

  if (!ALLOWED_STATUSES.includes(normalizedStatus)) {
    throw createServiceError("Status inválido.", 400);
  }

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [courseRows] = await connection.query(
      `SELECT id, name FROM courses WHERE id = ? LIMIT 1`,
      [normalizedCourseId]
    );

    if (courseRows.length === 0) {
      throw createServiceError("Curso não encontrado.", 404);
    }

    if (normalizedClassId !== null) {
      const [classRows] = await connection.query(
        `SELECT id, course_id FROM classes WHERE id = ? LIMIT 1`,
        [normalizedClassId]
      );

      if (classRows.length === 0) {
        throw createServiceError("Turma não encontrada.", 404);
      }

      validateClassBelongsToCourse(classRows[0], normalizedCourseId);
    }

    const [activityResult] = await connection.query(
      `
        INSERT INTO activities
          (course_id, class_id, activity_kind, title, description, type, due_date,
           max_score, status, created_at, updated_at)
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

    for (let index = 0; index < questions.length; index++) {
      const question = questions[index];

      const [questionResult] = await connection.query(
        `
          INSERT INTO activity_questions
            (activity_id, question_text, question_type, points, order_index)
          VALUES (?, ?, ?, ?, ?)
        `,
        [
          activityId,
          question.question_text.trim(),
          question.question_type,
          finalQuestionPoints[index],
          index + 1,
        ]
      );

      if (question.question_type === "multiple_choice") {
        for (const option of question.options) {
          await connection.query(
            `INSERT INTO activity_options (question_id, option_text, is_correct) VALUES (?, ?, ?)`,
            [
              questionResult.insertId,
              option.option_text.trim(),
              option.is_correct ? 1 : 0,
            ]
          );
        }
      }
    }

    await connection.commit();

    return getActivityById(db, activityKind, activityId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Atualiza uma atividade/avaliação. Bloqueia mudança estrutural de
 * questões quando há submissões (mesma regra do professor), e
 * bloqueia mudança de max_score quando já existem notas lançadas
 * (regra nova, só no admin).
 */
async function updateActivity(db, activityKind, id, payload) {
  const activityId = normalizeId(id, "ID inválido.");

  const {
    course_id: courseId,
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

  const rawClassId = payload.class_id !== undefined ? payload.class_id : payload.classId;

  const normalizedCourseId = normalizeId(courseId, "Curso é obrigatório e deve ser válido.");
  const normalizedClassId =
    rawClassId !== undefined && rawClassId !== null && rawClassId !== ""
      ? normalizeId(rawClassId, "ID da turma inválido.")
      : null;

  if (!title?.trim()) {
    throw createServiceError("O título é obrigatório.", 400);
  }

  if (!ALLOWED_ACTIVITY_TYPES.includes(type)) {
    throw createServiceError("Formato inválido.", 400);
  }

  const normalizedStatus = status || "active";

  if (!ALLOWED_STATUSES.includes(normalizedStatus)) {
    throw createServiceError("Status inválido.", 400);
  }

  const normalizedMaxScore = Number(maxScore);

  if (!Number.isFinite(normalizedMaxScore) || normalizedMaxScore <= 0) {
    throw createServiceError("A nota máxima deve ser maior que zero.", 400);
  }

  validateQuestions(questions);

  const finalQuestionPoints = distributeQuestionPoints(questions, normalizedMaxScore);

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [activityRows] = await connection.query(
      `
        SELECT id, course_id, order_index, is_required
        FROM activities
        WHERE id = ? AND activity_kind = ?
        LIMIT 1
        FOR UPDATE
      `,
      [activityId, activityKind]
    );

    if (activityRows.length === 0) {
      throw createServiceError("Registro não encontrado.", 404);
    }

    const current = activityRows[0];

    const [courseRows] = await connection.query(
      `SELECT id FROM courses WHERE id = ? LIMIT 1`,
      [normalizedCourseId]
    );

    if (courseRows.length === 0) {
      throw createServiceError("Curso não encontrado.", 404);
    }

    if (normalizedClassId !== null) {
      const [classRows] = await connection.query(
        `SELECT id, course_id FROM classes WHERE id = ? LIMIT 1`,
        [normalizedClassId]
      );

      if (classRows.length === 0) {
        throw createServiceError("Turma não encontrada.", 404);
      }

      validateClassBelongsToCourse(classRows[0], normalizedCourseId);
    }

    const [submissionCountRows] = await connection.query(
      `SELECT COUNT(*) AS total FROM submissions WHERE activity_id = ?`,
      [activityId]
    );

    const totalSubmissions = Number(submissionCountRows[0].total);

    const [gradeCountRows] = await connection.query(
      `SELECT COUNT(*) AS total FROM grades WHERE activity_id = ?`,
      [activityId]
    );

    const totalGrades = Number(gradeCountRows[0].total);

    // Não há mais uma guarda dedicada de "max_score não pode mudar com
    // notas lançadas": como a pontuação de cada questão agora vem de
    // distributeQuestionPoints (explícita ou repartida a partir da nota
    // máxima), qualquer mudança de nota máxima que alterasse a pontuação
    // final de alguma questão já é bloqueada abaixo por
    // "totalSubmissions > 0 && questionsWereChanged" — totalGrades > 0
    // implica totalSubmissions > 0.
    const [currentQuestionRows] = await connection.query(
      `
        SELECT id, question_text, question_type, points, order_index
        FROM activity_questions
        WHERE activity_id = ?
        ORDER BY order_index ASC, id ASC
      `,
      [activityId]
    );

    const [currentOptionRows] = await connection.query(
      `
        SELECT ao.id, ao.question_id, ao.option_text, ao.is_correct
        FROM activity_options ao
        INNER JOIN activity_questions aq ON aq.id = ao.question_id
        WHERE aq.activity_id = ?
        ORDER BY aq.order_index ASC, aq.id ASC, ao.id ASC
      `,
      [activityId]
    );

    const currentOptionsByQuestionId = new Map();

    for (const option of currentOptionRows) {
      const questionId = Number(option.question_id);

      if (!currentOptionsByQuestionId.has(questionId)) {
        currentOptionsByQuestionId.set(questionId, []);
      }

      currentOptionsByQuestionId.get(questionId).push(option);
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
        "Este registro já possui envios. É possível alterar dados gerais, mas não questões ou alternativas.",
        409
      );

      error.extra = { impact: { totalSubmissions, totalGrades } };
      throw error;
    }

    const finalOrderIndex =
      orderIndex !== undefined && orderIndex !== null && orderIndex !== ""
        ? Number(orderIndex)
        : current.order_index;

    const finalIsRequired =
      isRequired !== undefined && isRequired !== null
        ? isRequired === true || isRequired === 1 || isRequired === "1"
          ? 1
          : 0
        : current.is_required;

    await connection.query(
      `
        UPDATE activities
        SET course_id = ?, class_id = ?, title = ?, description = ?, type = ?,
            due_date = ?, max_score = ?, order_index = ?, is_required = ?,
            status = ?, updated_at = NOW()
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
        activityId,
      ]
    );

    if (totalSubmissions === 0) {
      await connection.query(`DELETE FROM activity_questions WHERE activity_id = ?`, [
        activityId,
      ]);

      for (let index = 0; index < questions.length; index++) {
        const question = questions[index];

        const [questionResult] = await connection.query(
          `
            INSERT INTO activity_questions
              (activity_id, question_text, question_type, points, order_index, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, NOW(), NOW())
          `,
          [
            activityId,
            question.question_text.trim(),
            question.question_type,
            finalQuestionPoints[index],
            index + 1,
          ]
        );

        if (question.question_type === "multiple_choice") {
          for (const option of question.options) {
            await connection.query(
              `INSERT INTO activity_options (question_id, option_text, is_correct, created_at) VALUES (?, ?, ?, NOW())`,
              [
                questionResult.insertId,
                option.option_text.trim(),
                option.is_correct ? 1 : 0,
              ]
            );
          }
        }
      }
    }

    await connection.commit();

    return getActivityById(db, activityKind, activityId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateActivityStatus(db, activityKind, id, status) {
  const activityId = normalizeId(id, "ID inválido.");

  if (!ALLOWED_STATUSES.includes(status)) {
    throw createServiceError("Status inválido.", 400);
  }

  const [result] = await db
    .promise()
    .query(
      `UPDATE activities SET status = ?, updated_at = NOW() WHERE id = ? AND activity_kind = ?`,
      [status, activityId, activityKind]
    );

  if (result.affectedRows === 0) {
    throw createServiceError("Registro não encontrado.", 404);
  }

  return getActivityById(db, activityKind, activityId);
}

/**
 * Exclusão física só quando não há submissões nem notas — senão
 * 409 com o impacto (mesmo padrão de deleteClass/deleteMaterial).
 */
async function deleteActivity(db, activityKind, id) {
  const activityId = normalizeId(id, "ID inválido.");

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [activityRows] = await connection.query(
      `SELECT id FROM activities WHERE id = ? AND activity_kind = ? LIMIT 1`,
      [activityId, activityKind]
    );

    if (activityRows.length === 0) {
      throw createServiceError("Registro não encontrado.", 404);
    }

    const impact = await getActivityImpact(connection, activityId);

    if (impact.totalSubmissions > 0 || impact.totalGrades > 0) {
      const error = createServiceError(
        "Este registro possui envios ou notas e não pode ser excluído. Prefira arquivar.",
        409
      );
      error.extra = { impact };
      throw error;
    }

    await connection.query(`DELETE FROM activities WHERE id = ?`, [activityId]);

    await connection.commit();

    return { id: activityId, deleted: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  createServiceError,
  listActivities,
  getActivityById,
  getActivityImpactById,
  createActivity,
  updateActivity,
  updateActivityStatus,
  deleteActivity,
  ALLOWED_ACTIVITY_TYPES,
  ALLOWED_STATUSES,
};
