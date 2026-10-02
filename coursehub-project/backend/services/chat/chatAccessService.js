const { createServiceError } = require("./chatParticipantService");

const ALLOWED_ACCESS_REASONS = ["report_review", "support", "academic_audit", "financial_audit", "safety", "other"];

const SUPERVISION_TYPES = ["teacher_support", "academic_peer"];

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

/**
 * Extraordinary read is an admin action, not a grant between admins.
 * Every active admin can open a conversation they are not part of.
 * Teacher and student stay limited to their own participation.
 */
async function canSuperviseConversation(runner, { adminUserId }) {
  const [rows] = await runner.query(
    `SELECT id FROM users WHERE id = ? AND role = 'admin' AND status = 'active' LIMIT 1`,
    [adminUserId]
  );

  return rows.length > 0;
}

function normalizeLimit(limit) {
  const normalized = Number(limit);

  return Number.isInteger(normalized) && normalized > 0 ? Math.min(normalized, MAX_LIMIT) : DEFAULT_LIMIT;
}

function normalizeCursor(cursor) {
  if (cursor === undefined || cursor === null || cursor === "") {
    return null;
  }

  const normalized = Number(cursor);

  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw createServiceError("Cursor inválido.", 400);
  }

  return normalized;
}

async function getConversationTypeOrThrow(runner, conversationId) {
  const [rows] = await runner.query(`SELECT type FROM chat_conversations WHERE id = ? LIMIT 1`, [conversationId]);

  if (rows.length === 0) {
    throw createServiceError("Conversa não encontrada.", 404);
  }

  return rows[0].type;
}

/**
 * Every extraordinary access is logged, never silent -- unlike the
 * generic participant routes, which return 404 for both "doesn't
 * exist" and "you're not authorized" to avoid leaking existence, this
 * is an explicit admin-only supervision action: 403 (not 404) when
 * the conversation exists but the caller is not an active admin.
 */
async function logAccess(runner, { adminUserId, conversationId, accessReason, details }) {
  if (!ALLOWED_ACCESS_REASONS.includes(accessReason)) {
    throw createServiceError(`Motivo de acesso inválido. Use um de: ${ALLOWED_ACCESS_REASONS.join(", ")}.`, 400);
  }

  await runner.query(
    `INSERT INTO chat_access_logs (admin_user_id, conversation_id, access_reason, details, created_at) VALUES (?, ?, ?, ?, NOW())`,
    [adminUserId, conversationId, accessReason, details || null]
  );
}

/**
 * Full conversation detail plus the participant roster (there's no
 * single "other participant" concept for a non-participant
 * supervisor the way there is for a caller's own inbox) -- one call,
 * logs one access_logs row.
 */
async function getConversationForSupervisor(db, { conversationId, adminUserId, accessReason, details }) {
  const runner = db.promise();

  const [rows] = await runner.query(
    `
      SELECT
        id, type, channel_kind, title, category, status, priority,
        assigned_user_id, created_by_user_id, initiator_role,
        last_message_id, last_message_at, created_at, updated_at, resolved_at, closed_at
      FROM chat_conversations
      WHERE id = ?
      LIMIT 1
    `,
    [conversationId]
  );

  if (rows.length === 0) {
    throw createServiceError("Conversa não encontrada.", 404);
  }

  const conversation = rows[0];

  const allowed = await canSuperviseConversation(runner, { adminUserId });

  if (!allowed) {
    throw createServiceError("Você não tem permissão para supervisionar este tipo de conversa.", 403);
  }

  const [participantRows] = await runner.query(
    `
      SELECT cp.user_id, cp.participant_role, cp.left_at, u.name
      FROM chat_participants cp
      INNER JOIN users u ON u.id = cp.user_id
      WHERE cp.conversation_id = ?
      ORDER BY cp.id ASC
    `,
    [conversationId]
  );

  await logAccess(runner, { adminUserId, conversationId, accessReason, details });

  return {
    conversationId: conversation.id,
    type: conversation.type,
    channelKind: conversation.channel_kind,
    title: conversation.title,
    category: conversation.category,
    status: conversation.status,
    priority: conversation.priority,
    assignedUserId: conversation.assigned_user_id,
    createdByUserId: conversation.created_by_user_id,
    initiatorRole: conversation.initiator_role,
    lastMessageId: conversation.last_message_id,
    lastMessageAt: conversation.last_message_at,
    createdAt: conversation.created_at,
    updatedAt: conversation.updated_at,
    participants: participantRows.map((row) => ({
      userId: row.user_id,
      role: row.participant_role,
      name: row.name,
      active: row.left_at === null,
    })),
  };
}

/**
 * Message history for a supervised conversation -- same permission
 * check as getConversationForSupervisor, but does not write a new
 * chat_access_logs row per call: the initial "open for supervision"
 * access is what gets logged, not every subsequent page of history
 * within that same review.
 */
async function listMessagesForSupervisor(db, { conversationId, adminUserId, cursor, limit }) {
  const runner = db.promise();
  const normalizedLimit = normalizeLimit(limit);
  const normalizedCursor = normalizeCursor(cursor);

  await getConversationTypeOrThrow(runner, conversationId);

  const allowed = await canSuperviseConversation(runner, { adminUserId });

  if (!allowed) {
    throw createServiceError("Você não tem permissão para supervisionar este tipo de conversa.", 403);
  }

  const conditions = ["cm.conversation_id = ?"];
  const params = [conversationId];

  if (normalizedCursor) {
    conditions.push("cm.id < ?");
    params.push(normalizedCursor);
  }

  const [rows] = await runner.query(
    `
      SELECT
        cm.id, cm.conversation_id, cm.sender_user_id, cm.reply_to_message_id,
        cm.message_type, cm.body, cm.edited_at, cm.deleted_at, cm.deleted_by_user_id, cm.created_at,
        u.name AS sender_name
      FROM chat_messages cm
      LEFT JOIN users u ON u.id = cm.sender_user_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY cm.id DESC
      LIMIT ?
    `,
    [...params, normalizedLimit + 1]
  );

  const hasMore = rows.length > normalizedLimit;
  const pageRows = hasMore ? rows.slice(0, normalizedLimit) : rows;

  return {
    items: pageRows.map((row) => ({
      messageId: row.id,
      conversationId: row.conversation_id,
      senderUserId: row.sender_user_id,
      senderName: row.sender_name,
      replyToMessageId: row.reply_to_message_id,
      messageType: row.message_type,
      // Unlike the participant-facing mapMessageRow, supervision sees
      // the original body even for a soft-deleted message -- that's
      // the whole point of "only authorized supervision sees the
      // original" from the master prompt.
      body: row.body,
      isDeleted: Boolean(row.deleted_at),
      deletedByUserId: row.deleted_by_user_id,
      editedAt: row.edited_at,
      createdAt: row.created_at,
    })),
    nextCursor: hasMore ? pageRows[pageRows.length - 1].id : null,
  };
}

async function listConversationsForSupervision(db, { type, search, cursor, limit }) {
  const normalizedLimit = normalizeLimit(limit);
  const normalizedCursor = normalizeCursor(cursor);
  const trimmedSearch = typeof search === "string" ? search.trim() : "";

  if (type && !SUPERVISION_TYPES.includes(type)) {
    throw createServiceError(`Tipo inválido. Use um de: ${SUPERVISION_TYPES.join(", ")}.`, 400);
  }

  const conditions = ["cc.type IN (?, ?)"];
  const params = [...SUPERVISION_TYPES];

  if (type) {
    conditions.push("cc.type = ?");
    params.push(type);
  }

  if (trimmedSearch) {
    conditions.push(
      `(cc.title LIKE ? OR EXISTS (
        SELECT 1
        FROM chat_participants cp_search
        INNER JOIN users u_search ON u_search.id = cp_search.user_id
        WHERE cp_search.conversation_id = cc.id
          AND u_search.name LIKE ?
      ))`
    );
    const like = `%${trimmedSearch}%`;
    params.push(like, like);
  }

  if (normalizedCursor) {
    conditions.push("cc.id < ?");
    params.push(normalizedCursor);
  }

  const [rows] = await db.promise().query(
    `
      SELECT
        cc.id, cc.type, cc.channel_kind, cc.title, cc.category, cc.status,
        cc.last_message_at, cc.created_at,
        co.name AS course_name,
        cl.name AS class_name,
        (
          SELECT GROUP_CONCAT(u.name ORDER BY u.name SEPARATOR ', ')
          FROM chat_participants cp
          INNER JOIN users u ON u.id = cp.user_id
          WHERE cp.conversation_id = cc.id
            AND cp.left_at IS NULL
        ) AS participant_names
      FROM chat_conversations cc
      LEFT JOIN courses co ON co.id = cc.course_id
      LEFT JOIN classes cl ON cl.id = cc.class_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY cc.id DESC
      LIMIT ?
    `,
    [...params, normalizedLimit + 1]
  );

  const hasMore = rows.length > normalizedLimit;
  const pageRows = hasMore ? rows.slice(0, normalizedLimit) : rows;

  return {
    items: pageRows.map((row) => ({
      conversationId: row.id,
      type: row.type,
      channelKind: row.channel_kind,
      title: row.title,
      category: row.category,
      status: row.status,
      courseName: row.course_name,
      className: row.class_name,
      participantNames: row.participant_names,
      lastMessageAt: row.last_message_at,
      createdAt: row.created_at,
    })),
    nextCursor: hasMore ? pageRows[pageRows.length - 1].id : null,
  };
}

async function listAccessLogs(db, { conversationId, cursor, limit }) {
  const normalizedLimit = normalizeLimit(limit);
  const normalizedCursor = normalizeCursor(cursor);

  const conditions = ["al.conversation_id = ?"];
  const params = [conversationId];

  if (normalizedCursor) {
    conditions.push("al.id < ?");
    params.push(normalizedCursor);
  }

  const [rows] = await db.promise().query(
    `
      SELECT al.id, al.admin_user_id, u.name AS admin_name, al.access_reason, al.details, al.created_at
      FROM chat_access_logs al
      INNER JOIN users u ON u.id = al.admin_user_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY al.id DESC
      LIMIT ?
    `,
    [...params, normalizedLimit + 1]
  );

  const hasMore = rows.length > normalizedLimit;
  const pageRows = hasMore ? rows.slice(0, normalizedLimit) : rows;

  return {
    items: pageRows.map((row) => ({
      id: row.id,
      adminUserId: row.admin_user_id,
      adminName: row.admin_name,
      accessReason: row.access_reason,
      details: row.details,
      createdAt: row.created_at,
    })),
    nextCursor: hasMore ? pageRows[pageRows.length - 1].id : null,
  };
}

module.exports = {
  ALLOWED_ACCESS_REASONS,
  SUPERVISION_TYPES,
  canSuperviseConversation,
  getConversationTypeOrThrow,
  listConversationsForSupervision,
  getConversationForSupervisor,
  listMessagesForSupervisor,
  listAccessLogs,
};
