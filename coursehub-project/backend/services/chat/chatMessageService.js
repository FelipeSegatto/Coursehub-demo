const { withTransaction } = require("../../utils/dbTransaction");
const { createServiceError, assertParticipant } = require("./chatParticipantService");
const { createNotificationEvent } = require("../notifications/notificationService");
const { resolveOtherActiveParticipants } = require("../notifications/notificationRecipientResolvers");

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const MAX_BODY_LENGTH = 4000;

/**
 * Ticket-style modalities flip status based on who just posted --
 * "aguardando resposta de quem". staff_support is keyed by which side
 * of a professor<->admin pair posted (teacher -> waiting_staff, admin
 * -> waiting_teacher), the same shape as administrative_support but
 * with "teacher" standing in for "student" as the requesting side.
 */
const TICKET_STATUS_TRANSITIONS = {
  teacher_support: { student: "waiting_staff", teacher: "waiting_student" },
  administrative_support: { student: "waiting_staff", admin: "waiting_student" },
  staff_support: { teacher: "waiting_staff", admin: "waiting_teacher" },
};

/**
 * "Ticket resolvido pode ser reaberto dentro de uma janela
 * configurável; depois disso, nova solicitação cria novo protocolo."
 * Keyed by the "requesting" role for that modality -- the side whose
 * message is what triggers a silent reopen; the other side (staff/
 * admin) can always post a final note on a resolved ticket without
 * reopening it. teacher_support has no reopen policy in the master
 * prompt, so a message there just doesn't touch status once resolved/
 * closed (existing Etapa 9 behavior, unchanged).
 */
const REOPEN_POLICY = {
  administrative_support: {
    days: Number(process.env.CHAT_TICKET_REOPEN_WINDOW_DAYS) || 7,
    requesterRole: "student",
  },
  staff_support: {
    days: Number(process.env.CHAT_TICKET_REOPEN_WINDOW_DAYS) || 7,
    requesterRole: "teacher",
  },
};

/**
 * Null means "don't touch status" -- either this isn't a ticket-style
 * modality or the sender's role has no defined transition for it.
 */
function computeNextConversationStatus(conversationType, senderRole, currentStatus) {
  if (currentStatus === "resolved" || currentStatus === "closed") {
    return null;
  }

  const transitions = TICKET_STATUS_TRANSITIONS[conversationType];

  return transitions?.[senderRole] ?? null;
}

/**
 * Decides what happens when someone posts to an already resolved/
 * closed conversation. Three outcomes:
 *   - { allowed: false } -- reject the message outright (student,
 *     outside the reopen window for a modality that has one; they
 *     need to open a new ticket instead).
 *   - { allowed: true, nextStatus: "waiting_staff" } -- reopen (
 *     student, inside the window).
 *   - { allowed: true, nextStatus: null } -- post without touching
 *     status (no reopen policy for this modality, or the sender
 *     isn't the side the policy applies to -- e.g. an admin replying
 *     to a closed ticket to add a final note).
 * Comparing two real Date objects' epoch millis here is safe
 * regardless of server/process timezone -- unlike the bare
 * "YYYY-MM-DD" string bug class documented elsewhere in this
 * project, a DATETIME column read as a JS Date always represents the
 * same absolute instant no matter which timezone constructed it.
 */
function evaluateResolvedConversationMessage(conversationType, senderRole, conversation) {
  const policy = REOPEN_POLICY[conversationType];

  if (!policy || senderRole !== policy.requesterRole) {
    return { allowed: true, nextStatus: null };
  }

  const resolvedOrClosedAt = conversation.resolved_at || conversation.closed_at;
  const windowMs = policy.days * 24 * 60 * 60 * 1000;
  const withinWindow = resolvedOrClosedAt && Date.now() - new Date(resolvedOrClosedAt).getTime() <= windowMs;

  if (withinWindow) {
    return { allowed: true, nextStatus: "waiting_staff" };
  }

  return { allowed: false };
}

function normalizeLimit(limit) {
  const normalized = Number(limit);

  return Number.isInteger(normalized) && normalized > 0
    ? Math.min(normalized, MAX_LIMIT)
    : DEFAULT_LIMIT;
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

/**
 * A soft-deleted message keeps its metadata (who/when) but never its
 * body, for every caller -- the "placeholder for participants, only
 * authorized supervision sees the original" split from the master
 * prompt is Etapa 12's job (chat_access_logs-gated reads); this
 * service has no supervision path yet, so it always applies the
 * placeholder rule uniformly.
 */
function mapMessageRow(row) {
  const isDeleted = Boolean(row.deleted_at);

  return {
    messageId: row.id,
    conversationId: row.conversation_id,
    senderUserId: row.sender_user_id,
    senderName: row.sender_name,
    replyToMessageId: row.reply_to_message_id,
    messageType: row.message_type,
    body: isDeleted ? null : row.body,
    isDeleted,
    editedAt: row.edited_at,
    createdAt: row.created_at,
  };
}

async function getMessageById(runner, messageId) {
  const [rows] = await runner.query(
    `
      SELECT
        cm.id, cm.conversation_id, cm.sender_user_id, cm.reply_to_message_id,
        cm.message_type, cm.body, cm.edited_at, cm.deleted_at, cm.created_at,
        u.name AS sender_name
      FROM chat_messages cm
      LEFT JOIN users u ON u.id = cm.sender_user_id
      WHERE cm.id = ?
      LIMIT 1
    `,
    [messageId]
  );

  return rows.length > 0 ? mapMessageRow(rows[0]) : null;
}

/**
 * "Mensagens de sistema são criadas apenas pelo backend" -- takes an
 * open `connection` directly rather than `db`, since every call site
 * (assignment, reassignment, resolution notices) already runs inside
 * its own transaction alongside the state change the message is
 * announcing; this is never meant to be called standalone. Bypasses
 * assertParticipant/can_post entirely (there's no human sender) and
 * never touches conversation status on its own -- a system message
 * documents a change, the caller applies the change itself.
 */
async function createSystemMessage(connection, { conversationId, body }) {
  const trimmedBody = typeof body === "string" ? body.trim() : "";

  if (!trimmedBody) {
    throw createServiceError("Mensagem de sistema vazia.", 400);
  }

  const [result] = await connection.query(
    `
      INSERT INTO chat_messages (conversation_id, sender_user_id, message_type, body, created_at)
      VALUES (?, NULL, 'system', ?, NOW())
    `,
    [conversationId, trimmedBody]
  );

  const messageId = result.insertId;

  await connection.query(
    `UPDATE chat_conversations SET last_message_id = ?, last_message_at = NOW(), updated_at = NOW() WHERE id = ?`,
    [messageId, conversationId]
  );

  return getMessageById(connection, messageId);
}

/**
 * Transactional: validates participation + can_post + body length +
 * reply_to ownership, inserts the message, and bumps the
 * conversation's last_message_id/last_message_at -- all in the same
 * transaction, so a message is never visible without its conversation
 * being updated to match, and a rollback never leaves a stray
 * message. client_message_id + sender is the idempotency guard: a
 * repeated send with the same id from the same sender returns the
 * already-created message instead of duplicating -- checked upfront
 * (fast path for the common re-send) and again via ER_DUP_ENTRY
 * (handles two genuinely concurrent identical sends racing the
 * upfront check).
 */
async function createMessage(
  db,
  { conversationId, userId, body, clientMessageId = null, replyToMessageId = null, messageType = "text" }
) {
  const trimmedBody = typeof body === "string" ? body.trim() : "";

  if (!trimmedBody) {
    throw createServiceError("A mensagem não pode ficar vazia.", 400);
  }

  if (trimmedBody.length > MAX_BODY_LENGTH) {
    throw createServiceError(`A mensagem deve ter no máximo ${MAX_BODY_LENGTH} caracteres.`, 400);
  }

  return withTransaction(db, async (connection) => {
    const participant = await assertParticipant(connection, { conversationId, userId });

    if (!participant.canPost) {
      throw createServiceError("Você não pode enviar mensagens nesta conversa.", 403);
    }

    const [conversationRows] = await connection.query(
      `SELECT type, status, resolved_at, closed_at FROM chat_conversations WHERE id = ? FOR UPDATE`,
      [conversationId]
    );

    const conversation = conversationRows[0];

    let forcedNextStatus;

    if (conversation.status === "resolved" || conversation.status === "closed") {
      const evaluation = evaluateResolvedConversationMessage(conversation.type, participant.role, conversation);

      if (!evaluation.allowed) {
        throw createServiceError(
          "Este protocolo já foi resolvido há mais tempo do que o permitido para reabertura. Abra um novo protocolo.",
          409
        );
      }

      forcedNextStatus = evaluation.nextStatus;
    }

    if (clientMessageId) {
      const [existingRows] = await connection.query(
        `SELECT id FROM chat_messages WHERE sender_user_id = ? AND client_message_id = ? LIMIT 1`,
        [userId, clientMessageId]
      );

      if (existingRows.length > 0) {
        return getMessageById(connection, existingRows[0].id);
      }
    }

    if (replyToMessageId) {
      const [replyRows] = await connection.query(
        `SELECT id FROM chat_messages WHERE id = ? AND conversation_id = ? LIMIT 1`,
        [replyToMessageId, conversationId]
      );

      if (replyRows.length === 0) {
        throw createServiceError("A mensagem respondida não pertence a esta conversa.", 400);
      }
    }

    let messageId;

    try {
      const [result] = await connection.query(
        `
          INSERT INTO chat_messages
            (conversation_id, sender_user_id, reply_to_message_id, client_message_id, message_type, body, created_at)
          VALUES (?, ?, ?, ?, ?, ?, NOW())
        `,
        [conversationId, userId, replyToMessageId, clientMessageId, messageType, trimmedBody]
      );

      messageId = result.insertId;
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY" && clientMessageId) {
        const [existingRows] = await connection.query(
          `SELECT id FROM chat_messages WHERE sender_user_id = ? AND client_message_id = ? LIMIT 1`,
          [userId, clientMessageId]
        );

        if (existingRows.length > 0) {
          return getMessageById(connection, existingRows[0].id);
        }
      }

      throw error;
    }

    const nextStatus =
      forcedNextStatus !== undefined
        ? forcedNextStatus
        : computeNextConversationStatus(conversation.type, participant.role, conversation.status);

    if (nextStatus) {
      await connection.query(
        `
          UPDATE chat_conversations
          SET last_message_id = ?, last_message_at = NOW(), status = ?, updated_at = NOW()
          WHERE id = ?
        `,
        [messageId, nextStatus, conversationId]
      );
    } else {
      await connection.query(
        `
          UPDATE chat_conversations
          SET last_message_id = ?, last_message_at = NOW(), updated_at = NOW()
          WHERE id = ?
        `,
        [messageId, conversationId]
      );
    }

    const savedMessage = await getMessageById(connection, messageId);

    const recipients = await resolveOtherActiveParticipants(connection, {
      conversationId,
      excludeUserId: userId,
    });

    if (recipients.length > 0) {
      // administrative_support replies use their own notification type
      // (category "request") so they surface under "Requerimentos" in
      // the admin inbox instead of being mixed into the generic "Chat"
      // category -- every other modality keeps chat.message.received.
      // Never both for the same message: this is a branch, not an
      // addition.
      const eventType =
        conversation.type === "administrative_support"
          ? "administrative.request.message_received"
          : "chat.message.received";

      await createNotificationEvent(db, {
        type: eventType,
        sourceType: "chat_conversation",
        sourceId: conversationId,
        actorUserId: userId,
        context: {
          messageId,
          conversationId,
          conversationType: conversation.type,
          senderName: savedMessage.senderName,
          messageBody: trimmedBody,
        },
        recipients,
        connection,
      });
    }

    return savedMessage;
  });
}

/**
 * Cursor pagination by chat_messages.id (never OFFSET), most recent
 * first -- cursor moves strictly older, matching "load older history
 * on scroll up".
 */
async function listMessages(db, { conversationId, userId, cursor, limit }) {
  const normalizedLimit = normalizeLimit(limit);
  const normalizedCursor = normalizeCursor(cursor);

  await assertParticipant(db.promise(), { conversationId, userId });

  const conditions = ["cm.conversation_id = ?"];
  const params = [conversationId];

  if (normalizedCursor) {
    conditions.push("cm.id < ?");
    params.push(normalizedCursor);
  }

  const [rows] = await db.promise().query(
    `
      SELECT
        cm.id, cm.conversation_id, cm.sender_user_id, cm.reply_to_message_id,
        cm.message_type, cm.body, cm.edited_at, cm.deleted_at, cm.created_at,
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
    items: pageRows.map(mapMessageRow),
    nextCursor: hasMore ? pageRows[pageRows.length - 1].id : null,
  };
}

module.exports = {
  createServiceError,
  createMessage,
  createSystemMessage,
  listMessages,
  getMessageById,
  computeNextConversationStatus,
};
