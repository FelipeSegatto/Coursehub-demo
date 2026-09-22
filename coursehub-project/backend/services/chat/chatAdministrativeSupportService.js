const { withTransaction } = require("../../utils/dbTransaction");
const { createServiceError, getStudentIdByUserId } = require("../classes/classAccessService");
const { createConversation } = require("./chatConversationService");
const { addParticipant } = require("./chatParticipantService");
const { createSystemMessage } = require("./chatMessageService");
const { createNotificationEvent } = require("../notifications/notificationService");
const { resolveAllActiveAdmins } = require("../notifications/notificationRecipientResolvers");

const MAX_SUBJECT_LENGTH = 180;
const MAX_BODY_LENGTH = 4000;

const ALLOWED_CATEGORIES = ["financial", "calendar", "request"];

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

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

function mapQueueRow(row) {
  return {
    conversationId: row.id,
    title: row.title,
    category: row.category,
    status: row.status,
    priority: row.priority,
    assignedUserId: row.assigned_user_id,
    assignedAdminName: row.assigned_admin_name,
    student: { userId: row.student_user_id, name: row.student_name },
    lastMessageId: row.last_message_id,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * "Cada abertura cria protocolo derivado do ID, nunca usado como
 * autorização" -- the conversationId itself IS the protocol number
 * (no separate protocol field); it grants nothing by itself, same
 * "knowing the id isn't access" rule as every other conversation
 * (assertParticipant still gates everything). Opens with only the
 * student as participant -- no admin is assigned yet, that's a
 * separate, explicit claim/assign action.
 */
async function openAdministrativeTicket(db, { userId, category, subject, body }) {
  const trimmedSubject = typeof subject === "string" ? subject.trim() : "";
  const trimmedBody = typeof body === "string" ? body.trim() : "";

  if (!ALLOWED_CATEGORIES.includes(category)) {
    throw createServiceError(`Categoria inválida. Use uma de: ${ALLOWED_CATEGORIES.join(", ")}.`, 400);
  }

  if (!trimmedSubject) {
    throw createServiceError("Informe o assunto da solicitação.", 400);
  }

  if (trimmedSubject.length > MAX_SUBJECT_LENGTH) {
    throw createServiceError(`O assunto deve ter no máximo ${MAX_SUBJECT_LENGTH} caracteres.`, 400);
  }

  if (!trimmedBody) {
    throw createServiceError("Descreva sua solicitação.", 400);
  }

  if (trimmedBody.length > MAX_BODY_LENGTH) {
    throw createServiceError(`A mensagem deve ter no máximo ${MAX_BODY_LENGTH} caracteres.`, 400);
  }

  const studentId = await getStudentIdByUserId(db.promise(), userId);

  if (!studentId) {
    throw createServiceError("Aluno não encontrado.", 404);
  }

  const { conversationId } = await createConversation(db, {
    type: "administrative_support",
    channelKind: "ticket",
    title: trimmedSubject,
    category,
    createdByUserId: userId,
    initiatorRole: "student",
    initialStatus: "waiting_staff",
    initialMessage: { senderUserId: userId, body: trimmedBody },
    participants: [{ userId, participantRole: "student" }],
  });

  // The ticket has only the student as a participant at this point (no
  // admin claimed it yet), so resolveOtherActiveParticipants -- what
  // chat.message.received would normally use -- resolves to nobody.
  // resolveAllActiveAdmins is used instead so every active admin sees
  // "Novo requerimento" immediately, without auto-assigning anyone.
  // Fired after createConversation's own transaction has already
  // committed: the ticket itself must never fail to exist because of a
  // notification-layer problem, so this is swallowed (logged) rather
  // than propagated -- the student already got their ticket.
  try {
    const admins = await resolveAllActiveAdmins(db.promise());

    if (admins.length > 0) {
      const [[requester]] = await db.promise().query(`SELECT name FROM users WHERE id = ? LIMIT 1`, [userId]);

      await createNotificationEvent(db, {
        type: "administrative.request.created",
        sourceType: "chat_conversation",
        sourceId: conversationId,
        actorUserId: userId,
        context: {
          conversationId,
          studentName: requester?.name || "Um aluno",
          subject: trimmedSubject,
          administrativeCategory: category,
        },
        recipients: admins,
      });
    }
  } catch (notificationError) {
    console.error("[openAdministrativeTicket] falha ao notificar admins:", notificationError);
  }

  return { conversationId };
}

/**
 * Admin-facing queue: unlike listConversationsForUser, this is NOT
 * scoped by chat_participants membership -- an admin who hasn't
 * claimed a ticket yet still needs to see it exists. Any active
 * `role='admin'` user can see the whole queue (no category-level
 * granular permission exists yet -- deferred, same as the Etapa 7
 * decision, until a stage actually needs it; "Administradores
 * autorizados" collapses to "is an admin" for now).
 */
async function listAdministrativeQueue(db, { category, status, unassignedOnly, assignedToUserId, cursor, limit }) {
  const normalizedLimit = normalizeLimit(limit);
  const normalizedCursor = normalizeCursor(cursor);

  const conditions = ["cc.type = 'administrative_support'"];
  const params = [];

  if (category) {
    conditions.push("cc.category = ?");
    params.push(category);
  }

  if (status) {
    conditions.push("cc.status = ?");
    params.push(status);
  }

  if (unassignedOnly) {
    conditions.push("cc.assigned_user_id IS NULL");
  }

  if (assignedToUserId) {
    conditions.push("cc.assigned_user_id = ?");
    params.push(assignedToUserId);
  }

  if (normalizedCursor) {
    conditions.push("cc.id < ?");
    params.push(normalizedCursor);
  }

  const [rows] = await db.promise().query(
    `
      SELECT
        cc.id, cc.title, cc.category, cc.status, cc.priority, cc.assigned_user_id,
        cc.last_message_id, cc.last_message_at, cc.created_at, cc.updated_at,
        student_u.id AS student_user_id, student_u.name AS student_name,
        assigned_u.name AS assigned_admin_name
      FROM chat_conversations cc
      INNER JOIN chat_participants student_cp
        ON student_cp.conversation_id = cc.id AND student_cp.participant_role = 'student'
      INNER JOIN users student_u ON student_u.id = student_cp.user_id
      LEFT JOIN users assigned_u ON assigned_u.id = cc.assigned_user_id
      WHERE ${conditions.join(" AND ")}
      ORDER BY cc.id DESC
      LIMIT ?
    `,
    [...params, normalizedLimit + 1]
  );

  const hasMore = rows.length > normalizedLimit;
  const pageRows = hasMore ? rows.slice(0, normalizedLimit) : rows;

  return {
    items: pageRows.map(mapQueueRow),
    nextCursor: hasMore ? pageRows[pageRows.length - 1].id : null,
  };
}

/**
 * "Assumem/recebem atribuição, reatribuem" -- one function for both:
 * assigning an unassigned ticket and reassigning an already-assigned
 * one both just set assigned_user_id and ensure the new admin is a
 * participant. A previous assignee is deliberately left as a
 * participant (not removed) -- reassignment is a handoff, not an
 * access revocation, and their prior involvement stays visible in
 * the thread. Generates a system message either way.
 */
async function assignAdministrativeTicket(db, { conversationId, adminUserId }) {
  return withTransaction(db, async (connection) => {
    const [rows] = await connection.query(
      `SELECT id, type, assigned_user_id FROM chat_conversations WHERE id = ? AND type = 'administrative_support' FOR UPDATE`,
      [conversationId]
    );

    if (rows.length === 0) {
      throw createServiceError("Protocolo não encontrado.", 404);
    }

    const conversation = rows[0];

    // req.auth only ever carries {userId, role} (see
    // authenticateToken.js) -- the admin's display name for the
    // system message notice is looked up here, never trusted from
    // the client, which would also be a spoofing risk.
    const [adminRows] = await connection.query(`SELECT name FROM users WHERE id = ? LIMIT 1`, [adminUserId]);
    const adminName = adminRows[0]?.name || "Um administrador";

    const [participantRows] = await connection.query(
      `SELECT id FROM chat_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1`,
      [conversationId, adminUserId]
    );

    if (participantRows.length === 0) {
      await addParticipant(connection, { conversationId, userId: adminUserId, participantRole: "admin" });
    }

    await connection.query(`UPDATE chat_conversations SET assigned_user_id = ?, updated_at = NOW() WHERE id = ?`, [
      adminUserId,
      conversationId,
    ]);

    const noticeBody =
      conversation.assigned_user_id && conversation.assigned_user_id !== adminUserId
        ? `${adminName} assumiu o atendimento (reatribuído).`
        : `${adminName} assumiu o atendimento.`;

    await createSystemMessage(connection, { conversationId, body: noticeBody });

    return { conversationId, assignedUserId: adminUserId };
  });
}

module.exports = {
  ALLOWED_CATEGORIES,
  openAdministrativeTicket,
  listAdministrativeQueue,
  assignAdministrativeTicket,
};
