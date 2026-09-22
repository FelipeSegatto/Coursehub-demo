const { withTransaction } = require("../../utils/dbTransaction");
const { createServiceError, getTeacherIdByUserId } = require("../classes/classAccessService");
const { createConversation } = require("./chatConversationService");
const { addParticipant } = require("./chatParticipantService");
const { createSystemMessage } = require("./chatMessageService");

const MAX_SUBJECT_LENGTH = 180;
const MAX_BODY_LENGTH = 4000;

const ALLOWED_CATEGORIES = ["course", "class", "schedule", "administrative", "other"];

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

function validateTicketFields(category, subject, body) {
  const trimmedSubject = typeof subject === "string" ? subject.trim() : "";
  const trimmedBody = typeof body === "string" ? body.trim() : "";

  if (!ALLOWED_CATEGORIES.includes(category)) {
    throw createServiceError(`Categoria inválida. Use uma de: ${ALLOWED_CATEGORIES.join(", ")}.`, 400);
  }

  if (!trimmedSubject) {
    throw createServiceError("Informe o assunto.", 400);
  }

  if (trimmedSubject.length > MAX_SUBJECT_LENGTH) {
    throw createServiceError(`O assunto deve ter no máximo ${MAX_SUBJECT_LENGTH} caracteres.`, 400);
  }

  if (!trimmedBody) {
    throw createServiceError("Descreva sua mensagem.", 400);
  }

  if (trimmedBody.length > MAX_BODY_LENGTH) {
    throw createServiceError(`A mensagem deve ter no máximo ${MAX_BODY_LENGTH} caracteres.`, 400);
  }

  return { trimmedSubject, trimmedBody };
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
    teacher: { userId: row.teacher_user_id, name: row.teacher_name },
    lastMessageId: row.last_message_id,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Teacher-initiated half of the "bidirectional" pair: mirrors
 * openAdministrativeTicket exactly -- only the teacher is a
 * participant, unassigned, lands in the admin queue for a staff
 * member to claim.
 */
async function openStaffTicket(db, { userId, category, subject, body }) {
  const { trimmedSubject, trimmedBody } = validateTicketFields(category, subject, body);

  const teacherId = await getTeacherIdByUserId(db.promise(), userId);

  if (!teacherId) {
    throw createServiceError("Professor não encontrado.", 404);
  }

  const { conversationId } = await createConversation(db, {
    type: "staff_support",
    channelKind: "ticket",
    title: trimmedSubject,
    category,
    createdByUserId: userId,
    initiatorRole: "teacher",
    initialStatus: "waiting_staff",
    initialMessage: { senderUserId: userId, body: trimmedBody },
    participants: [{ userId, participantRole: "teacher" }],
  });

  return { conversationId };
}

/**
 * Admin-initiated half: the admin picks a specific active teacher and
 * starts the conversation with both sides already participants,
 * self-assigned -- there's no separate claim step here, since the
 * admin who opened it already IS the one talking to the teacher.
 * Lands in waiting_teacher (the admin just spoke, the teacher owes a
 * reply), the mirror image of openStaffTicket's waiting_staff.
 */
async function openStaffConversation(db, { adminUserId, teacherUserId, category, subject, body }) {
  const { trimmedSubject, trimmedBody } = validateTicketFields(category, subject, body);

  const [teacherRows] = await db.promise().query(
    `
      SELECT u.id
      FROM teachers t
      INNER JOIN users u ON u.id = t.user_id
      WHERE u.id = ? AND t.status = 'active' AND u.status = 'active'
      LIMIT 1
    `,
    [teacherUserId]
  );

  if (teacherRows.length === 0) {
    throw createServiceError("Professor não encontrado ou inativo.", 404);
  }

  const { conversationId } = await createConversation(db, {
    type: "staff_support",
    channelKind: "ticket",
    title: trimmedSubject,
    category,
    createdByUserId: adminUserId,
    initiatorRole: "admin",
    assignedUserId: adminUserId,
    initialStatus: "waiting_teacher",
    initialMessage: { senderUserId: adminUserId, body: trimmedBody },
    participants: [
      { userId: adminUserId, participantRole: "admin" },
      { userId: teacherUserId, participantRole: "teacher" },
    ],
  });

  return { conversationId };
}

/**
 * Admin-facing queue, same shape and same "not scoped by
 * chat_participants" reasoning as listAdministrativeQueue -- an admin
 * who hasn't claimed a teacher-opened ticket yet still needs to see
 * it exists. Admin-opened conversations (already assigned to their
 * own opener) show up here too via assignedToUserId, not as a
 * separate concept.
 */
async function listStaffQueue(db, { category, status, unassignedOnly, assignedToUserId, cursor, limit }) {
  const normalizedLimit = normalizeLimit(limit);
  const normalizedCursor = normalizeCursor(cursor);

  const conditions = ["cc.type = 'staff_support'"];
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
        teacher_u.id AS teacher_user_id, teacher_u.name AS teacher_name,
        assigned_u.name AS assigned_admin_name
      FROM chat_conversations cc
      INNER JOIN chat_participants teacher_cp
        ON teacher_cp.conversation_id = cc.id AND teacher_cp.participant_role = 'teacher'
      INNER JOIN users teacher_u ON teacher_u.id = teacher_cp.user_id
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
 * Claim/reassign a teacher-opened ticket -- same shape as
 * assignAdministrativeTicket. Admin-opened conversations never need
 * this (they're already assigned at creation), but nothing stops a
 * second admin from being added to one via this same path later if
 * that ever becomes a real need.
 */
async function assignStaffTicket(db, { conversationId, adminUserId }) {
  return withTransaction(db, async (connection) => {
    const [rows] = await connection.query(
      `SELECT id, type, assigned_user_id FROM chat_conversations WHERE id = ? AND type = 'staff_support' FOR UPDATE`,
      [conversationId]
    );

    if (rows.length === 0) {
      throw createServiceError("Conversa não encontrada.", 404);
    }

    const conversation = rows[0];

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
  openStaffTicket,
  openStaffConversation,
  listStaffQueue,
  assignStaffTicket,
};
