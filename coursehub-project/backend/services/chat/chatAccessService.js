const { createServiceError } = require("./chatParticipantService");
const { hasPermission } = require("../admin/adminPermissionService");

const ALLOWED_ACCESS_REASONS = ["report_review", "support", "academic_audit", "financial_audit", "safety", "other"];

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

/**
 * "Chat não é criptografado ponta a ponta; a instituição pode acessar
 * para suporte/segurança/auditoria, mas todo acesso extraordinário é
 * registrado" -- this is that gate. chat.audit_access is a global
 * override (any modality); the per-modality supervise_* keys are
 * narrower. A conversation type with no dedicated supervise key
 * (academic_peer -- students talking to each other has no "staff
 * side" to supervise routinely) is only reachable via chat.audit_access.
 */
const SUPERVISION_PERMISSION_BY_TYPE = {
  teacher_support: "chat.supervise_teacher_support",
  administrative_support: "chat.supervise_administrative_support",
  staff_support: "chat.supervise_staff_support",
};

async function canSuperviseConversation(runner, { adminUserId, conversationType }) {
  if (await hasPermission(runner, { userId: adminUserId, permissionKey: "chat.audit_access" })) {
    return true;
  }

  const modalityKey = SUPERVISION_PERMISSION_BY_TYPE[conversationType];

  if (!modalityKey) {
    return false;
  }

  return hasPermission(runner, { userId: adminUserId, permissionKey: modalityKey });
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
 * the conversation exists but the admin lacks the matching
 * permission, since "admin without permission" needs to be a
 * distinguishable, testable outcome here.
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

  const allowed = await canSuperviseConversation(runner, { adminUserId, conversationType: conversation.type });

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

  const conversationType = await getConversationTypeOrThrow(runner, conversationId);

  const allowed = await canSuperviseConversation(runner, { adminUserId, conversationType });

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
  canSuperviseConversation,
  getConversationTypeOrThrow,
  getConversationForSupervisor,
  listMessagesForSupervisor,
  listAccessLogs,
};
