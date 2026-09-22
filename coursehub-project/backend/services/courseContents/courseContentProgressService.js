const {
  getStudentIdByUserId,
  getActiveEnrollmentForStudent,
  createServiceError,
} = require("../classes/classAccessService");

const { CONTENT_TYPES } = require("./courseContentScopeService");

function normalizePositiveId(value) {
  const normalized = Number(value);

  return Number.isInteger(normalized) && normalized > 0
    ? normalized
    : null;
}

/**
 * Indica se um conteúdo está dentro do escopo visível de uma
 * matrícula: geral (class_id NULL) ou da mesma turma da matrícula.
 */
function isContentWithinEnrollmentScope(contentClassId, enrollmentClassId) {
  return (
    contentClassId === null ||
    contentClassId === undefined ||
    Number(contentClassId) === Number(enrollmentClassId)
  );
}

/**
 * Progresso de conteúdos de um curso para o aluno autenticado.
 * O denominador considera apenas conteúdos gerais e conteúdos da
 * turma da matrícula do aluno — nunca conteúdo exclusivo de outra
 * turma.
 */
async function getCourseProgressForStudent(db, { userId, courseId }) {
  const normalizedCourseId = normalizePositiveId(courseId);

  if (!normalizedCourseId) {
    throw createServiceError("ID do curso inválido.", 400);
  }

  const runner = db.promise();

  const studentId = await getStudentIdByUserId(runner, userId);

  if (!studentId) {
    throw createServiceError("Aluno não encontrado.", 404);
  }

  const [enrollmentRows] = await runner.execute(
    `
      SELECT
        e.id AS enrollment_id,
        e.student_id,
        e.course_id,
        e.class_id,
        e.status AS enrollment_status,
        c.name AS course_title
      FROM enrollments e

      INNER JOIN courses c
        ON c.id = e.course_id

      WHERE e.student_id = ?
        AND e.course_id = ?
        AND e.status = 'active'
        AND c.status = 'active'

      LIMIT 1
    `,
    [studentId, normalizedCourseId]
  );

  if (enrollmentRows.length === 0) {
    throw createServiceError(
      "O aluno não possui matrícula ativa neste curso.",
      403
    );
  }

  const enrollment = enrollmentRows[0];

  const [contentRows] = await runner.execute(
    `
      SELECT
        cc.id AS content_id,
        cc.course_id,
        cc.class_id,
        cc.title,
        cc.description,
        cc.type,
        cc.content_url,
        cc.content_text,
        cc.order_index,
        cc.is_required,
        cc.status AS content_status,

        scp.id AS progress_id,
        scp.student_id,
        scp.status AS progress_status,
        scp.progress_percentage,
        scp.last_position_seconds,
        scp.started_at,
        scp.completed_at,
        scp.last_accessed_at,
        scp.created_at AS progress_created_at,
        scp.updated_at AS progress_updated_at

      FROM course_contents cc

      LEFT JOIN student_content_progress scp
        ON scp.content_id = cc.id
        AND scp.student_id = ?

      WHERE cc.course_id = ?
        AND cc.status = 'active'
        AND cc.type IN (${CONTENT_TYPES.map(() => "?").join(", ")})
        AND (
          cc.class_id IS NULL
          OR cc.class_id = ?
        )

      ORDER BY
        cc.order_index ASC,
        cc.id ASC
    `,
    [
      studentId,
      normalizedCourseId,
      ...CONTENT_TYPES,
      enrollment.class_id,
    ]
  );

  const contents = contentRows.map((content) => ({
    content_id: content.content_id,
    course_id: content.course_id,
    title: content.title,
    description: content.description,
    type: content.type,
    content_url: content.content_url,
    content_text: content.content_text,
    order_index: content.order_index,
    is_required: Boolean(content.is_required),
    content_status: content.content_status,

    progress_id: content.progress_id,
    progress_status: content.progress_status || "not_started",

    progress_percentage:
      content.progress_percentage !== null &&
      content.progress_percentage !== undefined
        ? Number(content.progress_percentage)
        : 0,

    last_position_seconds:
      content.last_position_seconds !== null &&
      content.last_position_seconds !== undefined
        ? Number(content.last_position_seconds)
        : null,

    started_at: content.started_at,
    completed_at: content.completed_at,
    last_accessed_at: content.last_accessed_at,
    progress_created_at: content.progress_created_at,
    progress_updated_at: content.progress_updated_at,
  }));

  const requiredContents = contents.filter(
    (content) => content.is_required
  );

  const completedContents = requiredContents.filter(
    (content) => content.progress_status === "completed"
  );

  const inProgressContents = requiredContents.filter(
    (content) => content.progress_status === "in_progress"
  );

  const totalContents = requiredContents.length;
  const completedCount = completedContents.length;
  const inProgressCount = inProgressContents.length;

  const progressPercentage =
    totalContents > 0
      ? Number(((completedCount / totalContents) * 100).toFixed(2))
      : 0;

  return {
    student_id: studentId,
    course_id: normalizedCourseId,
    course_title: enrollment.course_title,

    total_contents: totalContents,
    completed_contents: completedCount,
    in_progress_contents: inProgressCount,
    not_started_contents: totalContents - completedCount - inProgressCount,

    progress_percentage: progressPercentage,

    contents,
  };
}

/**
 * Cria ou atualiza o progresso de um conteúdo para o aluno
 * autenticado. Impede progresso em conteúdo de outra turma.
 */
async function updateContentProgress(
  db,
  { userId, contentId, status, progressPercentage, lastPositionSeconds }
) {
  const normalizedContentId = normalizePositiveId(contentId);

  if (!normalizedContentId) {
    throw createServiceError("ID do conteúdo inválido.", 400);
  }

  const allowedStatuses = ["in_progress", "completed"];

  if (!allowedStatuses.includes(status)) {
    throw createServiceError(
      "O status deve ser in_progress ou completed.",
      400
    );
  }

  const normalizedProgressPercentage = Number(progressPercentage);

  if (
    !Number.isFinite(normalizedProgressPercentage) ||
    normalizedProgressPercentage < 0 ||
    normalizedProgressPercentage > 100
  ) {
    throw createServiceError(
      "O percentual de progresso deve estar entre 0 e 100.",
      400
    );
  }

  let normalizedLastPositionSeconds = null;

  if (
    lastPositionSeconds !== undefined &&
    lastPositionSeconds !== null &&
    lastPositionSeconds !== ""
  ) {
    normalizedLastPositionSeconds = Number(lastPositionSeconds);

    if (
      !Number.isInteger(normalizedLastPositionSeconds) ||
      normalizedLastPositionSeconds < 0
    ) {
      throw createServiceError(
        "A posição do conteúdo deve ser um número inteiro igual ou maior que zero.",
        400
      );
    }
  }

  const finalProgressPercentage =
    status === "completed"
      ? 100
      : Math.min(normalizedProgressPercentage, 99.99);

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [studentRows] = await connection.query(
      `
        SELECT id
        FROM students
        WHERE user_id = ?
        LIMIT 1
      `,
      [userId]
    );

    if (studentRows.length === 0) {
      throw createServiceError("Aluno não encontrado.", 404);
    }

    const studentId = Number(studentRows[0].id);

    const [contentRows] = await connection.query(
      `
        SELECT
          cc.id,
          cc.course_id,
          cc.class_id,
          cc.title,
          cc.type,
          cc.status AS content_status,

          c.name AS course_title,
          c.status AS course_status

        FROM course_contents cc

        INNER JOIN courses c
          ON c.id = cc.course_id

        WHERE cc.id = ?

        LIMIT 1
      `,
      [normalizedContentId]
    );

    if (contentRows.length === 0) {
      throw createServiceError("Conteúdo não encontrado.", 404);
    }

    const content = contentRows[0];
    const courseId = Number(content.course_id);

    if (content.content_status !== "active") {
      throw createServiceError(
        "Não é possível atualizar o progresso de um conteúdo inativo.",
        409
      );
    }

    if (content.course_status !== "active") {
      throw createServiceError(
        "Não é possível atualizar o progresso de um curso inativo.",
        409
      );
    }

    if (!CONTENT_TYPES.includes(content.type)) {
      throw createServiceError(
        "Este tipo de conteúdo não utiliza progresso de consumo.",
        400
      );
    }

    const [enrollmentRows] = await connection.query(
      `
        SELECT id, class_id
        FROM enrollments
        WHERE student_id = ?
          AND course_id = ?
          AND status = 'active'
        LIMIT 1
      `,
      [studentId, courseId]
    );

    if (enrollmentRows.length === 0) {
      throw createServiceError(
        "O aluno não possui matrícula ativa neste curso.",
        403
      );
    }

    const enrollment = enrollmentRows[0];

    /*
     * Impede progresso em conteúdo exclusivo de outra turma.
     * Conteúdo geral (class_id NULL) é sempre permitido.
     */
    if (
      !isContentWithinEnrollmentScope(
        content.class_id,
        enrollment.class_id
      )
    ) {
      throw createServiceError(
        "Este conteúdo pertence a outra turma e não está disponível para o aluno.",
        403
      );
    }

    const [existingProgressRows] = await connection.query(
      `
        SELECT
          id,
          status,
          progress_percentage,
          last_position_seconds,
          started_at,
          completed_at,
          last_accessed_at
        FROM student_content_progress
        WHERE student_id = ?
          AND content_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [studentId, normalizedContentId]
    );

    let progressId;
    let operation;

    if (existingProgressRows.length === 0) {
      const [insertResult] = await connection.query(
        `
          INSERT INTO student_content_progress
          (
            student_id,
            course_id,
            content_id,
            status,
            progress_percentage,
            last_position_seconds,
            started_at,
            completed_at,
            last_accessed_at,
            created_at,
            updated_at
          )
          VALUES
          (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            NOW(),
            CASE
              WHEN ? = 'completed'
              THEN NOW()
              ELSE NULL
            END,
            NOW(),
            NOW(),
            NOW()
          )
        `,
        [
          studentId,
          courseId,
          normalizedContentId,
          status,
          finalProgressPercentage,
          normalizedLastPositionSeconds,
          status,
        ]
      );

      progressId = insertResult.insertId;
      operation = "created";
    } else {
      const existingProgress = existingProgressRows[0];

      progressId = existingProgress.id;
      operation = "updated";

      const finalLastPositionSeconds =
        normalizedLastPositionSeconds !== null
          ? normalizedLastPositionSeconds
          : existingProgress.last_position_seconds;

      await connection.query(
        `
          UPDATE student_content_progress
          SET
            status = ?,
            progress_percentage = ?,
            last_position_seconds = ?,

            completed_at =
              CASE
                WHEN ? = 'completed'
                THEN COALESCE(completed_at, NOW())
                ELSE NULL
              END,

            last_accessed_at = NOW(),
            updated_at = NOW()

          WHERE id = ?
        `,
        [
          status,
          finalProgressPercentage,
          finalLastPositionSeconds,
          status,
          progressId,
        ]
      );
    }

    const [updatedProgressRows] = await connection.query(
      `
        SELECT
          scp.id,
          scp.student_id,
          scp.course_id,
          scp.content_id,
          scp.status,
          scp.progress_percentage,
          scp.last_position_seconds,
          scp.started_at,
          scp.completed_at,
          scp.last_accessed_at,
          scp.created_at,
          scp.updated_at,

          cc.title AS content_title,
          cc.type AS content_type,

          c.name AS course_title

        FROM student_content_progress scp

        INNER JOIN course_contents cc
          ON cc.id = scp.content_id

        INNER JOIN courses c
          ON c.id = scp.course_id

        WHERE scp.id = ?

        LIMIT 1
      `,
      [progressId]
    );

    const updatedProgress = updatedProgressRows[0];

    await connection.commit();

    return {
      message:
        status === "completed"
          ? "Conteúdo marcado como concluído."
          : "Progresso do conteúdo atualizado.",

      operation,

      progress: {
        ...updatedProgress,

        progress_percentage: Number(
          updatedProgress.progress_percentage
        ),

        last_position_seconds:
          updatedProgress.last_position_seconds !== null &&
          updatedProgress.last_position_seconds !== undefined
            ? Number(updatedProgress.last_position_seconds)
            : null,
      },
    };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error(
        "Erro ao desfazer a transação de progresso:",
        rollbackError
      );
    }

    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  isContentWithinEnrollmentScope,
  getCourseProgressForStudent,
  updateContentProgress,
};
