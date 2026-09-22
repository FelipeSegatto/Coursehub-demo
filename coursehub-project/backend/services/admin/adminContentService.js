const {
  CONTENT_TYPES,
  resolveContentScope,
} = require("../courseContents/courseContentScopeService");
const { resolveMaterialContentUrl } = require("../files/uploadedFileService");

const ALLOWED_STATUSES = ["active", "inactive", "draft", "archived"];

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const LISTING_TEXT_PREVIEW_LENGTH = 200;

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

function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) return text || null;

  return `${text.slice(0, maxLength)}…`;
}

function mapContentRow(row, { truncate = false } = {}) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    contentUrl: row.content_url,
    contentText: truncate
      ? truncateText(row.content_text, LISTING_TEXT_PREVIEW_LENGTH)
      : row.content_text,
    course: { id: row.course_id, name: row.course_name },
    class: row.class_id ? { id: row.class_id, name: row.class_name } : null,
    scopeLabel: row.class_id ? row.class_name : "Geral",
    isRequired: Boolean(row.is_required),
    orderIndex: row.order_index,
    dueDate: row.due_date,
    status: row.status,
    progressCount: Number(row.progress_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const BASE_JOIN = `
  FROM course_contents cc
  INNER JOIN courses co ON co.id = cc.course_id
  LEFT JOIN classes cl ON cl.id = cc.class_id
`;

const SELECT_COLUMNS = `
  cc.id, cc.title, cc.description, cc.type, cc.content_url, cc.content_text,
  cc.order_index, cc.is_required, cc.status, cc.due_date, cc.created_at, cc.updated_at,
  co.id AS course_id, co.name AS course_name,
  cl.id AS class_id, cl.name AS class_name,
  COALESCE(progress_stats.progress_count, 0) AS progress_count
`;

const PROGRESS_JOIN = `
  LEFT JOIN (
    SELECT content_id, COUNT(*) AS progress_count
    FROM student_content_progress
    GROUP BY content_id
  ) progress_stats ON progress_stats.content_id = cc.id
`;

function buildListFilters(filters) {
  const conditions = [
    `cc.type IN (${CONTENT_TYPES.map(() => "?").join(", ")})`,
  ];
  const params = [...CONTENT_TYPES];

  const search = filters.search?.trim();

  if (search) {
    conditions.push("(cc.title LIKE ? OR co.name LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  if (filters.courseId) {
    conditions.push("cc.course_id = ?");
    params.push(normalizeId(filters.courseId, "ID do curso inválido."));
  }

  if (filters.classId) {
    conditions.push("cc.class_id = ?");
    params.push(normalizeId(filters.classId, "ID da turma inválido."));
  }

  if (filters.type) {
    if (!CONTENT_TYPES.includes(filters.type)) {
      throw createServiceError("Tipo de material inválido.", 400);
    }

    conditions.push("cc.type = ?");
    params.push(filters.type);
  }

  if (filters.status) {
    if (!ALLOWED_STATUSES.includes(filters.status)) {
      throw createServiceError("Status inválido.", 400);
    }

    conditions.push("cc.status = ?");
    params.push(filters.status);
  }

  if (filters.isRequired !== undefined && filters.isRequired !== "") {
    conditions.push("cc.is_required = ?");
    params.push(filters.isRequired === "true" || filters.isRequired === true ? 1 : 0);
  }

  if (filters.scope === "general") {
    conditions.push("cc.class_id IS NULL");
  } else if (filters.scope === "class_specific") {
    conditions.push("cc.class_id IS NOT NULL");
  }

  if (filters.from) {
    conditions.push("cc.due_date >= ?");
    params.push(`${filters.from} 00:00:00`);
  }

  if (filters.to) {
    conditions.push("cc.due_date <= ?");
    params.push(`${filters.to} 23:59:59`);
  }

  return { whereClause: conditions.join(" AND "), params };
}

async function getMaterialsSummary(db) {
  const [rows] = await db.promise().query(
    `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status IN ('inactive', 'archived') THEN 1 ELSE 0 END) AS inactive_or_archived,
        SUM(CASE WHEN class_id IS NULL THEN 1 ELSE 0 END) AS general,
        SUM(CASE WHEN class_id IS NOT NULL THEN 1 ELSE 0 END) AS class_specific,
        SUM(CASE WHEN due_date IS NOT NULL THEN 1 ELSE 0 END) AS with_due_date
      FROM course_contents
      WHERE type IN (${CONTENT_TYPES.map(() => "?").join(", ")})
    `,
    CONTENT_TYPES
  );

  const row = rows[0] || {};

  return {
    total: Number(row.total || 0),
    active: Number(row.active || 0),
    inactiveOrArchived: Number(row.inactive_or_archived || 0),
    general: Number(row.general || 0),
    classSpecific: Number(row.class_specific || 0),
    withDueDate: Number(row.with_due_date || 0),
  };
}

async function listMaterials(db, filters = {}) {
  const { whereClause, params } = buildListFilters(filters);
  const { page, limit, offset } = normalizePagination(filters.page, filters.limit);

  const [summary, [countRows], [rows]] = await Promise.all([
    getMaterialsSummary(db),
    db.promise().query(`SELECT COUNT(*) AS total ${BASE_JOIN} WHERE ${whereClause}`, params),
    db.promise().query(
      `
        SELECT ${SELECT_COLUMNS}
        ${BASE_JOIN}
        ${PROGRESS_JOIN}
        WHERE ${whereClause}
        ORDER BY co.name ASC, cc.order_index ASC, cc.created_at DESC
        LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    ),
  ]);

  const total = Number(countRows[0]?.total || 0);

  return {
    data: rows.map((row) => mapContentRow(row, { truncate: true })),
    summary,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  };
}

async function getMaterialById(db, id) {
  const contentId = normalizeId(id, "ID do material inválido.");

  const [rows] = await db.promise().query(
    `
      SELECT ${SELECT_COLUMNS}
      ${BASE_JOIN}
      ${PROGRESS_JOIN}
      WHERE cc.id = ?
        AND cc.type IN (${CONTENT_TYPES.map(() => "?").join(", ")})
      LIMIT 1
    `,
    [contentId, ...CONTENT_TYPES]
  );

  if (rows.length === 0) {
    throw createServiceError("Material não encontrado.", 404);
  }

  return mapContentRow(rows[0]);
}

/**
 * Alunos elegíveis (matrícula ativa) para um dado escopo do curso —
 * geral (classId null) inclui todo mundo matriculado ativamente no
 * curso; específico só quem está naquela turma.
 */
async function getEligibleStudentIds(runner, { courseId, classId }) {
  const conditions = ["course_id = ?", "status = 'active'"];
  const params = [courseId];

  if (classId) {
    conditions.push("class_id = ?");
    params.push(classId);
  }

  const [rows] = await runner.query(
    `SELECT student_id FROM enrollments WHERE ${conditions.join(" AND ")}`,
    params
  );

  return new Set(rows.map((row) => Number(row.student_id)));
}

/**
 * Impacto de uma mudança de escopo (geral↔turma ou turma↔outra
 * turma): quem perde/ganha visibilidade, e quantos registros de
 * progresso já existentes ficariam fora do novo escopo. Não impede
 * a operação — é informativo, para uma confirmação forte no
 * frontend antes de salvar.
 */
async function getContentScopeImpact(db, { courseId, oldClassId, newClassId }) {
  const runner = db.promise();

  const [oldEligible, newEligible] = await Promise.all([
    getEligibleStudentIds(runner, { courseId, classId: oldClassId }),
    getEligibleStudentIds(runner, { courseId, classId: newClassId }),
  ]);

  let studentsLosingAccess = 0;
  let studentsGainingAccess = 0;

  oldEligible.forEach((studentId) => {
    if (!newEligible.has(studentId)) studentsLosingAccess += 1;
  });

  newEligible.forEach((studentId) => {
    if (!oldEligible.has(studentId)) studentsGainingAccess += 1;
  });

  return {
    studentsLosingAccess,
    studentsGainingAccess,
    newEligibleStudentIds: newEligible,
  };
}

async function getScopeImpactPreview(db, id, newClassId) {
  const contentId = normalizeId(id, "ID do material inválido.");
  const normalizedNewClassId =
    newClassId !== undefined && newClassId !== null && newClassId !== ""
      ? normalizeId(newClassId, "ID da turma inválido.")
      : null;

  const [rows] = await db
    .promise()
    .query(`SELECT course_id, class_id FROM course_contents WHERE id = ? LIMIT 1`, [
      contentId,
    ]);

  if (rows.length === 0) {
    throw createServiceError("Material não encontrado.", 404);
  }

  const content = rows[0];

  const impact = await getContentScopeImpact(db, {
    courseId: content.course_id,
    oldClassId: content.class_id,
    newClassId: normalizedNewClassId,
  });

  const [progressRows] = await db
    .promise()
    .query(
      `SELECT student_id FROM student_content_progress WHERE content_id = ?`,
      [contentId]
    );

  const existingProgressOutsideNewScope = progressRows.filter(
    (row) => !impact.newEligibleStudentIds.has(Number(row.student_id))
  ).length;

  return {
    studentsLosingAccess: impact.studentsLosingAccess,
    studentsGainingAccess: impact.studentsGainingAccess,
    existingProgressOutsideNewScope,
  };
}

function requiresContentUrl(type) {
  return type === "video" || type === "pdf" || type === "live_class";
}

function requiresContentText(type) {
  return type === "text";
}

function normalizeMaterialPayload(payload) {
  const {
    title,
    description,
    type,
    content_url: contentUrl,
    content_text: contentText,
    order_index: orderIndex,
    is_required: isRequired,
    status,
    due_date: dueDate,
  } = payload;

  if (!title?.trim()) {
    throw createServiceError("O título é obrigatório.", 400);
  }

  if (!CONTENT_TYPES.includes(type)) {
    throw createServiceError("Tipo de material inválido.", 400);
  }

  if (requiresContentUrl(type) && !contentUrl?.trim()) {
    throw createServiceError(
      "A URL é obrigatória para este tipo de material.",
      400
    );
  }

  if (requiresContentText(type) && !contentText?.trim()) {
    throw createServiceError(
      "O texto do conteúdo é obrigatório para este tipo de material.",
      400
    );
  }

  // Conhecido: a exclusão de live_class do calendário depende só de
  // due_date IS NULL (ver docs/known-issues) — permitir devido nesse
  // tipo duplicaria o evento com class_sessions.
  if (type === "live_class" && dueDate) {
    throw createServiceError(
      "Aulas ao vivo não podem ter prazo — o encontro já é controlado pela turma (class_sessions).",
      400
    );
  }

  const normalizedStatus = status || "active";

  if (!ALLOWED_STATUSES.includes(normalizedStatus)) {
    throw createServiceError("Status inválido.", 400);
  }

  const normalizedOrderIndex = Math.max(1, Number(orderIndex) || 1);

  const rawClassId =
    payload.class_id !== undefined ? payload.class_id : payload.classId;

  const normalizedClassId =
    rawClassId !== undefined && rawClassId !== null && rawClassId !== ""
      ? normalizeId(rawClassId, "ID da turma inválido.")
      : null;

  return {
    title: title.trim(),
    description: description?.trim() || null,
    type,
    contentUrl: contentUrl?.trim() || null,
    contentText: contentText?.trim() || null,
    orderIndex: normalizedOrderIndex,
    isRequired: isRequired === true || isRequired === 1 || isRequired === "1",
    status: normalizedStatus,
    dueDate: dueDate || null,
    classId: normalizedClassId,
  };
}

async function createMaterial(db, payload, { userId } = {}) {
  const { course_id: courseId } = payload;
  const contentUrl = await resolveMaterialContentUrl(db, { userId, payload });
  const normalizedCourseId = normalizeId(courseId, "Curso é obrigatório e deve ser válido.");
  const normalized = normalizeMaterialPayload({ ...payload, content_url: contentUrl });

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [courseRows] = await connection.query(
      `SELECT id FROM courses WHERE id = ? LIMIT 1`,
      [normalizedCourseId]
    );

    if (courseRows.length === 0) {
      throw createServiceError("Curso não encontrado.", 404);
    }

    if (normalized.classId !== null) {
      const [classRows] = await connection.query(
        `SELECT id, course_id FROM classes WHERE id = ? LIMIT 1`,
        [normalized.classId]
      );

      if (classRows.length === 0) {
        throw createServiceError("Turma não encontrada.", 404);
      }

      if (Number(classRows[0].course_id) !== normalizedCourseId) {
        throw createServiceError(
          "A turma informada não pertence ao curso selecionado.",
          409
        );
      }
    }

    const [result] = await connection.query(
      `
        INSERT INTO course_contents
          (course_id, class_id, title, description, type, content_url, content_text,
           order_index, is_required, status, due_date, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        normalizedCourseId,
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

    await connection.commit();

    return getMaterialById(db, result.insertId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateMaterial(db, id, payload, { userId } = {}) {
  const contentId = normalizeId(id, "ID do material inválido.");
  const contentUrl = await resolveMaterialContentUrl(db, { userId, payload });
  const normalized = normalizeMaterialPayload({ ...payload, content_url: contentUrl });

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [contentRows] = await connection.query(
      `SELECT id, course_id, class_id FROM course_contents WHERE id = ? LIMIT 1
        FOR UPDATE`,
      [contentId]
    );

    if (contentRows.length === 0) {
      throw createServiceError("Material não encontrado.", 404);
    }

    const current = contentRows[0];

    if (normalized.classId !== null) {
      const [classRows] = await connection.query(
        `SELECT id, course_id FROM classes WHERE id = ? LIMIT 1`,
        [normalized.classId]
      );

      if (classRows.length === 0) {
        throw createServiceError("Turma não encontrada.", 404);
      }

      if (Number(classRows[0].course_id) !== Number(current.course_id)) {
        throw createServiceError(
          "A turma informada não pertence ao curso do material.",
          409
        );
      }
    }

    let scopeImpact = null;

    if (Number(current.class_id) !== Number(normalized.classId)) {
      scopeImpact = await getContentScopeImpact(db, {
        courseId: current.course_id,
        oldClassId: current.class_id,
        newClassId: normalized.classId,
      });
    }

    await connection.query(
      `
        UPDATE course_contents
        SET class_id = ?, title = ?, description = ?, type = ?, content_url = ?,
            content_text = ?, order_index = ?, is_required = ?, status = ?,
            due_date = ?, updated_at = NOW()
        WHERE id = ?
      `,
      [
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
        contentId,
      ]
    );

    await connection.commit();

    const material = await getMaterialById(db, contentId);

    return scopeImpact
      ? {
          material,
          scopeImpact: {
            studentsLosingAccess: scopeImpact.studentsLosingAccess,
            studentsGainingAccess: scopeImpact.studentsGainingAccess,
          },
        }
      : { material };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateMaterialStatus(db, id, status) {
  const contentId = normalizeId(id, "ID do material inválido.");

  if (!ALLOWED_STATUSES.includes(status)) {
    throw createServiceError("Status inválido.", 400);
  }

  const [result] = await db
    .promise()
    .query(`UPDATE course_contents SET status = ?, updated_at = NOW() WHERE id = ?`, [
      status,
      contentId,
    ]);

  if (result.affectedRows === 0) {
    throw createServiceError("Material não encontrado.", 404);
  }

  return getMaterialById(db, contentId);
}

async function getMaterialImpactById(db, id) {
  const contentId = normalizeId(id, "ID do material inválido.");

  const [contentRows] = await db
    .promise()
    .query(`SELECT id FROM course_contents WHERE id = ? LIMIT 1`, [contentId]);

  if (contentRows.length === 0) {
    throw createServiceError("Material não encontrado.", 404);
  }

  const [progressRows] = await db
    .promise()
    .query(`SELECT COUNT(*) AS count FROM student_content_progress WHERE content_id = ?`, [
      contentId,
    ]);

  return { progressRecords: Number(progressRows[0]?.count || 0) };
}

/**
 * Exclusão física só quando não há nenhum registro de progresso —
 * senão 409 com o impacto (mesmo padrão de deleteClass da Fase 2).
 */
async function deleteMaterial(db, id) {
  const contentId = normalizeId(id, "ID do material inválido.");

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [contentRows] = await connection.query(
      `SELECT id FROM course_contents WHERE id = ? LIMIT 1`,
      [contentId]
    );

    if (contentRows.length === 0) {
      throw createServiceError("Material não encontrado.", 404);
    }

    const [progressRows] = await connection.query(
      `SELECT COUNT(*) AS count FROM student_content_progress WHERE content_id = ?`,
      [contentId]
    );

    const progressRecords = Number(progressRows[0]?.count || 0);

    if (progressRecords > 0) {
      const error = createServiceError(
        "Este material já possui progresso registrado por alunos e não pode ser excluído. Prefira arquivar.",
        409
      );
      error.extra = { impact: { progressRecords } };
      throw error;
    }

    await connection.query(`DELETE FROM course_contents WHERE id = ?`, [contentId]);

    await connection.commit();

    return { id: contentId, deleted: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  createServiceError,
  listMaterials,
  getMaterialById,
  getScopeImpactPreview,
  getMaterialImpactById,
  createMaterial,
  updateMaterial,
  updateMaterialStatus,
  deleteMaterial,
};
