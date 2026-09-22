const { withTransaction } = require("../../utils/dbTransaction");
const { saveUploadedBuffer, readUploadedFile } = require("./fileStorageService");
const { isInlinePreviewMime } = require("../../config/uploadConfig");
const { isTeacherAssignedToCourse } = require("../courses/courseTeacherService");

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

function toFileDto(row) {
  return {
    id: Number(row.id),
    purpose: row.purpose,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    url: `/api/files/${row.id}`,
    createdAt: row.created_at,
  };
}

async function createUploadedFile(db, { ownerUserId, purpose, file }) {
  return withTransaction(db, async (connection) => {
    const [result] = await connection.query(
      `INSERT INTO uploaded_files
        (owner_user_id, purpose, original_name, mime_type, size_bytes, storage_key, status)
       VALUES (?, ?, ?, ?, ?, '', 'active')`,
      [ownerUserId, purpose, file.originalname || "arquivo", file.mimetype, file.size]
    );

    const fileId = result.insertId;
    const stored = await saveUploadedBuffer(file.buffer, {
      purpose,
      fileId,
      mimeType: file.mimetype,
    });

    await connection.query(
      `UPDATE uploaded_files SET storage_key = ?, updated_at = NOW() WHERE id = ?`,
      [stored.storageKey, fileId]
    );

    const [rows] = await connection.query(`SELECT * FROM uploaded_files WHERE id = ? LIMIT 1`, [fileId]);

    return toFileDto(rows[0]);
  });
}

async function getActiveFile(db, fileId) {
  const normalizedId = Number(fileId);

  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    throw createServiceError("Arquivo inválido.", 400);
  }

  const [rows] = await db
    .promise()
    .query(`SELECT * FROM uploaded_files WHERE id = ? AND status = 'active' LIMIT 1`, [normalizedId]);

  if (rows.length === 0) {
    throw createServiceError("Arquivo não encontrado.", 404);
  }

  return rows[0];
}

async function assertCanReadFile(db, file, auth) {
  if (file.owner_user_id === auth.userId || auth.role === "admin") {
    return;
  }

  if (file.purpose === "avatar") {
    return;
  }

  const fileUrl = `/api/files/${file.id}`;
  const runner = db.promise();

  if (file.purpose === "submission") {
    if (auth.role !== "teacher") {
      throw createServiceError("Você não tem permissão para baixar este arquivo.", 403);
    }

    const [teacherRows] = await runner.query(`SELECT id FROM teachers WHERE user_id = ? LIMIT 1`, [auth.userId]);
    const [answerRows] = await runner.query(
      `
        SELECT a.course_id
        FROM submission_answers sa
        INNER JOIN submissions s ON s.id = sa.submission_id
        INNER JOIN activities a ON a.id = s.activity_id
        WHERE sa.file_url = ?
        LIMIT 1
      `,
      [fileUrl]
    );

    if (teacherRows.length === 0 || answerRows.length === 0) {
      throw createServiceError("Você não tem permissão para baixar este arquivo.", 403);
    }

    const assigned = await isTeacherAssignedToCourse(runner, {
      courseId: answerRows[0].course_id,
      teacherId: teacherRows[0].id,
    });

    if (!assigned) {
      throw createServiceError("Você não tem permissão para baixar este arquivo.", 403);
    }

    return;
  }

  if (file.purpose === "course_material") {
    const [contentRows] = await runner.query(
      `SELECT course_id, class_id FROM course_contents WHERE content_url = ? AND status = 'active' LIMIT 1`,
      [fileUrl]
    );

    if (contentRows.length === 0) {
      throw createServiceError("Você não tem permissão para baixar este arquivo.", 403);
    }

    const { course_id: courseId, class_id: classId } = contentRows[0];

    if (auth.role === "teacher") {
      const [teacherRows] = await runner.query(`SELECT id FROM teachers WHERE user_id = ? LIMIT 1`, [
        auth.userId,
      ]);

      const assigned =
        teacherRows.length > 0 &&
        (await isTeacherAssignedToCourse(runner, { courseId, teacherId: teacherRows[0].id }));

      if (!assigned) {
        throw createServiceError("Você não tem permissão para baixar este arquivo.", 403);
      }

      return;
    }

    if (auth.role === "student") {
      const [enrollmentRows] = await runner.query(
        `
          SELECT 1
          FROM enrollments e
          INNER JOIN students st ON st.id = e.student_id
          WHERE st.user_id = ?
            AND e.course_id = ?
            AND e.status = 'active'
            AND (? IS NULL OR e.class_id = ?)
          LIMIT 1
        `,
        [auth.userId, courseId, classId, classId]
      );

      if (enrollmentRows.length === 0) {
        throw createServiceError("Você não tem permissão para baixar este arquivo.", 403);
      }

      return;
    }
  }

  throw createServiceError("Você não tem permissão para baixar este arquivo.", 403);
}

async function readAuthorizedFile(db, { fileId, auth }) {
  const file = await getActiveFile(db, fileId);

  await assertCanReadFile(db, file, auth);

  const buffer = await readUploadedFile(file.storage_key);

  return {
    buffer,
    mimeType: file.mime_type,
    originalName: file.original_name,
    inline: isInlinePreviewMime(file.mime_type),
  };
}

async function assertOwnedFile(db, { fileId, ownerUserId, purpose }) {
  const file = await getActiveFile(db, fileId);

  if (file.owner_user_id !== ownerUserId) {
    throw createServiceError("Este arquivo não pertence a você.", 403);
  }

  if (purpose && file.purpose !== purpose) {
    throw createServiceError("Este arquivo não pode ser usado neste contexto.", 400);
  }

  return file;
}

async function resolveMaterialContentUrl(db, { userId, payload }) {
  const fileId = payload?.file_id ?? payload?.fileId;
  const fallback = payload?.content_url?.trim() || payload?.contentUrl?.trim() || null;

  if (!fileId) {
    return fallback;
  }

  if (!userId) {
    throw createServiceError("Não foi possível associar o arquivo enviado.", 400);
  }

  const file = await assertOwnedFile(db, {
    fileId,
    ownerUserId: userId,
    purpose: "course_material",
  });

  return `/api/files/${file.id}`;
}

module.exports = {
  createServiceError,
  toFileDto,
  createUploadedFile,
  getActiveFile,
  readAuthorizedFile,
  assertOwnedFile,
  resolveMaterialContentUrl,
};
