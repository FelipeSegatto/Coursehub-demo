const {
  getTeacherIdByUserId,
  assertCourseBelongsToTeacher,
  getClassOwnedByTeacher,
  assertClassBelongsToCourseAndTeacher,
  createServiceError,
} = require("../classes/classAccessService");

const {
  CONTENT_TYPES,
  assertContentOwnedByTeacher,
  withContentScopeFieldsBothCasing,
} = require("./courseContentScopeService");

const { withTransaction } = require("../../utils/dbTransaction");
const { datesRepresentSameInstant } = require("../../utils/appConfig");
const { createNotificationEvent } = require("../notifications/notificationService");
const {
  resolveActiveStudentsForCourseOrClass,
} = require("../notifications/notificationRecipientResolvers");
const { resolveMaterialContentUrl } = require("../files/uploadedFileService");

const ALLOWED_STATUSES = ["active", "inactive", "draft", "archived"];

/**
 * Shared by every learning.content.* event -- same shape as
 * teacherActivityService's notifyActivityEvent. A course/class with
 * no actively-enrolled students is normal, not an error.
 */
async function notifyContentEvent(
  db,
  connection,
  type,
  { contentId, contentType, title, dueDate, courseId, courseName, classId, teacherUserId }
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
    sourceType: "course_content",
    sourceId: contentId,
    actorUserId: teacherUserId,
    courseId,
    classId,
    context: {
      contentId,
      contentTitle: title,
      contentType,
      courseId,
      courseName,
      dueDate,
      classId,
    },
    recipients,
    connection,
  });
}

function normalizePositiveId(value) {
  const normalized = Number(value);

  return Number.isInteger(normalized) && normalized > 0
    ? normalized
    : null;
}

/**
 * Normaliza class_id vindo do corpo da requisição: string vazia,
 * undefined ou null viram null (conteúdo geral). Qualquer outro
 * valor precisa ser um inteiro positivo válido.
 */
function normalizeClassIdInput(rawClassId) {
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

async function resolveTeacherId(runner, userId) {
  const teacherId = await getTeacherIdByUserId(runner, userId);

  if (!teacherId) {
    throw createServiceError("Professor não encontrado.", 404);
  }

  return teacherId;
}

/**
 * Lista todos os conteúdos dos cursos do professor autenticado,
 * com filtros opcionais por courseId, classId, status e type.
 */
async function listTeacherCourseContents(
  db,
  { userId, courseId, classId, status, type }
) {
  const runner = db.promise();

  // Mantém o comportamento original: a posse é resolvida pelo
  // próprio JOIN (t.user_id = ?), sem checagem prévia de existência
  // do professor — um professor inexistente simplesmente devolve
  // lista vazia, como sempre devolveu.
  const conditions = [
    "t.user_id = ?",
    `cc.type IN (${CONTENT_TYPES.map(() => "?").join(", ")})`,
  ];

  const params = [userId, ...CONTENT_TYPES];

  if (courseId !== undefined && courseId !== null && courseId !== "") {
    const normalizedCourseId = normalizePositiveId(courseId);

    if (!normalizedCourseId) {
      throw createServiceError("ID do curso inválido.", 400);
    }

    conditions.push("cc.course_id = ?");
    params.push(normalizedCourseId);
  }

  if (classId !== undefined && classId !== null && classId !== "") {
    const normalizedClassId = normalizePositiveId(classId);

    if (!normalizedClassId) {
      throw createServiceError("ID da turma inválido.", 400);
    }

    conditions.push("cc.class_id = ?");
    params.push(normalizedClassId);
  }

  if (type) {
    if (!CONTENT_TYPES.includes(type)) {
      throw createServiceError("Tipo de conteúdo inválido.", 400);
    }

    conditions.push("cc.type = ?");
    params.push(type);
  }

  if (status) {
    if (!ALLOWED_STATUSES.includes(status)) {
      throw createServiceError("Status de conteúdo inválido.", 400);
    }

    conditions.push("cc.status = ?");
    params.push(status);
  }

  const [rows] = await runner.execute(
    `
      SELECT
        cc.id,
        cc.course_id,
        cc.class_id,
        cc.title,
        cc.description,
        cc.type,
        cc.content_url,
        cc.content_text,
        cc.order_index,
        cc.is_required,
        cc.status,
        cc.due_date,
        cc.created_at,
        cc.updated_at,

        c.name AS course_name,
        c.name AS course_title,

        cl.name AS class_name

      FROM teachers t

      INNER JOIN courses c
        ON (
          EXISTS (
            SELECT 1 FROM course_teachers ct
            WHERE ct.course_id = c.id AND ct.teacher_id = t.id AND ct.status = 'active'
          )
          OR c.teacher_id = t.id
        )

      INNER JOIN course_contents cc
        ON cc.course_id = c.id

      LEFT JOIN classes cl
        ON cl.id = cc.class_id

      WHERE ${conditions.join(" AND ")}

      ORDER BY
        c.name ASC,
        cc.order_index ASC,
        cc.created_at DESC
    `,
    params
  );

  return rows.map((row) => withContentScopeFieldsBothCasing(row));
}

/**
 * Lista os conteúdos visíveis em uma turma específica: gerais do
 * curso + exclusivos dessa turma. Nunca inclui conteúdo de outra
 * turma do mesmo curso.
 */
async function listClassCourseContents(db, { userId, classId, status }) {
  const runner = db.promise();
  const teacherId = await resolveTeacherId(runner, userId);

  const normalizedClassId = normalizePositiveId(classId);

  if (!normalizedClassId) {
    throw createServiceError("ID da turma inválido.", 400);
  }

  const statusFilter = status || "active";

  if (!ALLOWED_STATUSES.includes(statusFilter)) {
    throw createServiceError("Status de conteúdo inválido.", 400);
  }

  const classData = await getClassOwnedByTeacher(runner, {
    classId: normalizedClassId,
    teacherId,
  });

  if (!classData) {
    throw createServiceError(
      "Turma não encontrada ou não vinculada ao professor.",
      404
    );
  }

  const params = [
    classData.course_id,
    normalizedClassId,
    ...CONTENT_TYPES,
    statusFilter,
  ];

  const statusCondition = "AND cc.status = ?";

  const [rows] = await runner.execute(
    `
      SELECT
        cc.id,
        cc.course_id,
        cc.class_id,
        cc.title,
        cc.description,
        cc.type,
        cc.content_url,
        cc.content_text,
        cc.order_index,
        cc.is_required,
        cc.status,
        cc.due_date,
        cc.created_at,
        cc.updated_at

      FROM course_contents cc

      WHERE cc.course_id = ?
        AND (
          cc.class_id IS NULL
          OR cc.class_id = ?
        )
        AND cc.type IN (${CONTENT_TYPES.map(() => "?").join(", ")})
        ${statusCondition}

      ORDER BY
        cc.order_index ASC,
        cc.created_at ASC
    `,
    params
  );

  const contents = rows.map((row) => {
    const isClassSpecific = row.class_id !== null;

    return {
      id: row.id,
      courseId: row.course_id,

      title: row.title,
      description: row.description,
      type: row.type,

      /*
       * Duplicado em camelCase e snake_case: LessonPlayer.jsx lê
       * content_url/content_text (snake_case) — expor as duas
       * formas evita quebrar quem já consome uma delas.
       */
      contentUrl: row.content_url,
      content_url: row.content_url,
      contentText: row.content_text,
      content_text: row.content_text,

      orderIndex: row.order_index,
      order_index: row.order_index,
      isRequired: Boolean(row.is_required),
      is_required: Boolean(row.is_required),

      status: row.status,
      dueDate: row.due_date,
      due_date: row.due_date,

      createdAt: row.created_at,
      created_at: row.created_at,
      updatedAt: row.updated_at,
      updated_at: row.updated_at,

      classId: row.class_id,
      className: isClassSpecific ? classData.name : null,
      contentScope: isClassSpecific ? "class_specific" : "general",
    };
  });

  return {
    class: {
      id: classData.id,
      name: classData.name,
      shift: classData.shift,
      status: classData.status,

      courseId: classData.course_id,
      courseTitle: classData.course_title,
    },

    contents,
  };
}

/**
 * Valida o corpo de criação/atualização de um conteúdo e devolve
 * os valores normalizados. Não toca no banco.
 */
function normalizeContentPayload(payload) {
  const {
    course_id: courseId,
    title,
    description,
    type,
    content_text: contentText,
    content_url: contentUrl,
    order_index: orderIndex,
    is_required: isRequired,
    status,
    due_date: dueDate,
  } = payload;

  const normalizedCourseId = normalizePositiveId(courseId);

  if (
    !normalizedCourseId ||
    !title?.trim() ||
    !type
  ) {
    throw createServiceError(
      "Curso, título e tipo são obrigatórios.",
      400
    );
  }

  if (!CONTENT_TYPES.includes(type)) {
    throw createServiceError("Tipo de conteúdo inválido.", 400);
  }

  const normalizedStatus = status || "active";

  if (!ALLOWED_STATUSES.includes(normalizedStatus)) {
    throw createServiceError("Status inválido.", 400);
  }

  const normalizedOrderIndex = Math.max(1, Number(orderIndex) || 1);

  const normalizedIsRequired =
    isRequired === true || isRequired === 1 || isRequired === "1";

  const rawClassId =
    payload.class_id !== undefined ? payload.class_id : payload.classId;

  const normalizedClassId = normalizeClassIdInput(rawClassId);

  return {
    courseId: normalizedCourseId,
    title: title.trim(),
    description: description?.trim() || null,
    type,
    contentUrl: contentUrl?.trim() || null,
    contentText: contentText?.trim() || null,
    orderIndex: normalizedOrderIndex,
    isRequired: normalizedIsRequired,
    status: normalizedStatus,
    dueDate: dueDate || null,
    classId: normalizedClassId,
  };
}

/**
 * Cria um conteúdo em um curso do professor, com escopo geral
 * (classId null) ou exclusivo de uma turma daquele mesmo curso.
 */
async function createCourseContent(db, { userId, payload }) {
  const contentUrl = await resolveMaterialContentUrl(db, { userId, payload });
  const normalized = normalizeContentPayload({ ...payload, content_url: contentUrl });

  return withTransaction(db, async (connection) => {
    const teacherId = await resolveTeacherId(connection, userId);

    const course = await assertCourseBelongsToTeacher(connection, {
      courseId: normalized.courseId,
      teacherId,
    });

    if (normalized.classId !== null) {
      await assertClassBelongsToCourseAndTeacher(connection, {
        classId: normalized.classId,
        courseId: normalized.courseId,
        teacherId,
      });
    }

    const [result] = await connection.execute(
      `
        INSERT INTO course_contents
        (
          course_id,
          class_id,
          title,
          description,
          type,
          content_url,
          content_text,
          order_index,
          is_required,
          status,
          due_date
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        normalized.courseId,
        normalized.classId,
        normalized.title,
        normalized.description,
        normalized.type,
        normalized.contentUrl,
        normalized.contentText,
        normalized.orderIndex,
        normalized.isRequired ? 1 : 0,
        normalized.status,
        normalized.dueDate,
      ]
    );

    if (normalized.status === "active") {
      await notifyContentEvent(db, connection, "learning.content.published", {
        contentId: result.insertId,
        contentType: normalized.type,
        title: normalized.title,
        dueDate: normalized.dueDate,
        courseId: normalized.courseId,
        courseName: course.name,
        classId: normalized.classId,
        teacherUserId: userId,
      });
    }

    return withContentScopeFieldsBothCasing({
      id: result.insertId,
      course_id: normalized.courseId,
      title: normalized.title,
      description: normalized.description,
      type: normalized.type,
      content_url: normalized.contentUrl,
      content_text: normalized.contentText,
      order_index: normalized.orderIndex,
      is_required: normalized.isRequired,
      status: normalized.status,
      due_date: normalized.dueDate,
    }, { classId: normalized.classId, className: null });
  });
}

/**
 * Atualiza um conteúdo existente do professor, permitindo mover
 * entre geral/turma ou entre turmas do mesmo curso.
 */
async function updateCourseContent(db, { userId, contentId, payload }) {
  const normalizedContentId = normalizePositiveId(contentId);

  if (!normalizedContentId) {
    throw createServiceError("ID do conteúdo inválido.", 400);
  }

  const contentUrl = await resolveMaterialContentUrl(db, { userId, payload });
  const normalized = normalizeContentPayload({ ...payload, content_url: contentUrl });

  return withTransaction(db, async (connection) => {
    const teacherId = await resolveTeacherId(connection, userId);

    const previousContent = await assertContentOwnedByTeacher(connection, {
      contentId: normalizedContentId,
      teacherId,
    });

    const course = await assertCourseBelongsToTeacher(connection, {
      courseId: normalized.courseId,
      teacherId,
    });

    if (normalized.classId !== null) {
      await assertClassBelongsToCourseAndTeacher(connection, {
        classId: normalized.classId,
        courseId: normalized.courseId,
        teacherId,
      });
    }

    const [result] = await connection.execute(
      `
        UPDATE course_contents
        SET
          course_id = ?,
          class_id = ?,
          title = ?,
          description = ?,
          type = ?,
          content_url = ?,
          content_text = ?,
          order_index = ?,
          is_required = ?,
          status = ?,
          due_date = ?,
          updated_at = NOW()
        WHERE id = ?
      `,
      [
        normalized.courseId,
        normalized.classId,
        normalized.title,
        normalized.description,
        normalized.type,
        normalized.contentUrl,
        normalized.contentText,
        normalized.orderIndex,
        normalized.isRequired ? 1 : 0,
        normalized.status,
        normalized.dueDate,
        normalizedContentId,
      ]
    );

    if (result.affectedRows === 0) {
      throw createServiceError("Conteúdo não encontrado.", 404);
    }

    const previousClassId =
      previousContent.class_id === null ? null : Number(previousContent.class_id);
    const scopeChanged = previousClassId !== normalized.classId;
    const dueDateChanged = !datesRepresentSameInstant(previousContent.due_date, normalized.dueDate);

    if (previousContent.status === "draft" && normalized.status === "active") {
      await notifyContentEvent(db, connection, "learning.content.published", {
        contentId: normalizedContentId,
        contentType: normalized.type,
        title: normalized.title,
        dueDate: normalized.dueDate,
        courseId: normalized.courseId,
        courseName: course.name,
        classId: normalized.classId,
        teacherUserId: userId,
      });
    } else if (
      previousContent.status === "active" &&
      normalized.status === "active" &&
      (dueDateChanged || scopeChanged)
    ) {
      await notifyContentEvent(db, connection, "learning.content.changed", {
        contentId: normalizedContentId,
        contentType: normalized.type,
        title: normalized.title,
        dueDate: normalized.dueDate,
        courseId: normalized.courseId,
        courseName: course.name,
        classId: normalized.classId,
        teacherUserId: userId,
      });
    } else if (previousContent.status === "active" && normalized.status !== "active") {
      await notifyContentEvent(db, connection, "learning.content.cancelled", {
        contentId: normalizedContentId,
        contentType: normalized.type,
        title: normalized.title,
        dueDate: normalized.dueDate,
        courseId: normalized.courseId,
        courseName: course.name,
        classId: normalized.classId,
        teacherUserId: userId,
      });
    }

    return withContentScopeFieldsBothCasing({
      id: normalizedContentId,
      course_id: normalized.courseId,
      title: normalized.title,
      description: normalized.description,
      type: normalized.type,
      content_url: normalized.contentUrl,
      content_text: normalized.contentText,
      order_index: normalized.orderIndex,
      is_required: normalized.isRequired,
      status: normalized.status,
      due_date: normalized.dueDate,
    }, { classId: normalized.classId, className: null });
  });
}

/**
 * Arquiva (soft delete) um conteúdo do professor.
 */
async function archiveCourseContent(db, { userId, contentId }) {
  const normalizedContentId = normalizePositiveId(contentId);

  if (!normalizedContentId) {
    throw createServiceError("ID do conteúdo inválido.", 400);
  }

  return withTransaction(db, async (connection) => {
    const teacherId = await resolveTeacherId(connection, userId);

    const content = await assertContentOwnedByTeacher(connection, {
      contentId: normalizedContentId,
      teacherId,
    });

    if (content.status === "archived") {
      throw createServiceError("Este conteúdo já está arquivado.", 409);
    }

    const wasActive = content.status === "active";

    const [result] = await connection.execute(
      `
        UPDATE course_contents
        SET
          status = 'archived',
          updated_at = NOW()
        WHERE id = ?
      `,
      [normalizedContentId]
    );

    if (result.affectedRows === 0) {
      throw createServiceError(
        "Não foi possível localizar o conteúdo para arquivamento.",
        404
      );
    }

    if (wasActive) {
      const course = await assertCourseBelongsToTeacher(connection, {
        courseId: content.course_id,
        teacherId,
      });

      await notifyContentEvent(db, connection, "learning.content.cancelled", {
        contentId: normalizedContentId,
        contentType: content.type,
        title: content.title,
        dueDate: content.due_date,
        courseId: content.course_id,
        courseName: course.name,
        classId: content.class_id,
        teacherUserId: userId,
      });
    }

    return {
      id: normalizedContentId,
      status: "archived",
    };
  });
}

module.exports = {
  listTeacherCourseContents,
  listClassCourseContents,
  createCourseContent,
  updateCourseContent,
  archiveCourseContent,
};
