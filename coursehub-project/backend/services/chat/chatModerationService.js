const { createServiceError, assertParticipant } = require("./chatParticipantService");
const { canSuperviseConversation, getConversationTypeOrThrow } = require("./chatAccessService");

const ALLOWED_REASONS = ["spam", "abuse", "harassment", "inappropriate_content", "other"];
const ALLOWED_REVIEW_STATUSES = ["resolved", "dismissed"];
const MAX_DETAILS_LENGTH = 500;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

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

function mapReportRow(row) {
  return {
    id: row.id,
    messageId: row.message_id,
    messageBody: row.body,
    messageDeleted: Boolean(row.deleted_at),
    conversationId: row.conversation_id,
    conversationType: row.type,
    reporterUserId: row.reporter_user_id,
    reporterName: row.reporter_name,
    reason: row.reason,
    details: row.details,
    status: row.status,
    reviewedByUserId: row.reviewed_by_user_id,
    resolutionNote: row.resolution_note,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  };
}

/**
 * Any participant of the message's own conversation can report it --
 * assertParticipant both proves they're allowed to see the message
 * and doubles as the 404-not-403 guard against reporting a message in
 * a conversation the caller was never part of. UNIQUE(message_id,
 * reporter_user_id) at the DB level means a second report from the
 * same person is rejected outright (409), not silently merged or
 * duplicated -- one open report per reporter per message is enough
 * for a human reviewer to act on.
 */
async function reportMessage(db, { messageId, reporterUserId, reason, details }) {
  const trimmedDetails = typeof details === "string" ? details.trim() : "";

  if (!ALLOWED_REASONS.includes(reason)) {
    throw createServiceError(`Motivo inválido. Use um de: ${ALLOWED_REASONS.join(", ")}.`, 400);
  }

  if (trimmedDetails.length > MAX_DETAILS_LENGTH) {
    throw createServiceError(`Os detalhes devem ter no máximo ${MAX_DETAILS_LENGTH} caracteres.`, 400);
  }

  const runner = db.promise();

  const [messageRows] = await runner.query(`SELECT id, conversation_id FROM chat_messages WHERE id = ? LIMIT 1`, [
    messageId,
  ]);

  if (messageRows.length === 0) {
    throw createServiceError("Mensagem não encontrada.", 404);
  }

  const conversationId = messageRows[0].conversation_id;

  await assertParticipant(runner, { conversationId, userId: reporterUserId });

  try {
    await runner.query(
      `
        INSERT INTO chat_reports (message_id, reporter_user_id, reason, details, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'open', NOW(), NOW())
      `,
      [messageId, reporterUserId, reason, trimmedDetails || null]
    );
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      throw createServiceError("Você já reportou esta mensagem.", 409);
    }

    throw error;
  }

  return { messageId, reported: true };
}

/**
 * Admin-facing moderation queue. Every active role='admin' user can
 * see it, same "collapses to is an admin for now" precedent as the
 * administrative_support ticket queue -- report triage is a platform-
 * wide responsibility, not scoped to a supervised modality the way
 * reading someone else's conversation is.
 */
async function listReports(db, { status, cursor, limit }) {
  const normalizedLimit = normalizeLimit(limit);
  const normalizedCursor = normalizeCursor(cursor);

  const conditions = [];
  const params = [];

  if (status) {
    conditions.push("cr.status = ?");
    params.push(status);
  }

  if (normalizedCursor) {
    conditions.push("cr.id < ?");
    params.push(normalizedCursor);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows] = await db.promise().query(
    `
      SELECT
        cr.id, cr.message_id, cr.reporter_user_id, cr.reason, cr.details, cr.status,
        cr.reviewed_by_user_id, cr.resolution_note, cr.resolved_at, cr.created_at,
        cm.body, cm.deleted_at, cm.conversation_id,
        cc.type,
        reporter.name AS reporter_name
      FROM chat_reports cr
      INNER JOIN chat_messages cm ON cm.id = cr.message_id
      INNER JOIN chat_conversations cc ON cc.id = cm.conversation_id
      INNER JOIN users reporter ON reporter.id = cr.reporter_user_id
      ${whereClause}
      ORDER BY cr.id DESC
      LIMIT ?
    `,
    [...params, normalizedLimit + 1]
  );

  const hasMore = rows.length > normalizedLimit;
  const pageRows = hasMore ? rows.slice(0, normalizedLimit) : rows;

  return {
    items: pageRows.map(mapReportRow),
    nextCursor: hasMore ? pageRows[pageRows.length - 1].id : null,
  };
}

async function reviewReport(db, { reportId, adminUserId, status, resolutionNote }) {
  if (!ALLOWED_REVIEW_STATUSES.includes(status)) {
    throw createServiceError(`Status inválido. Use um de: ${ALLOWED_REVIEW_STATUSES.join(", ")}.`, 400);
  }

  const trimmedNote = typeof resolutionNote === "string" ? resolutionNote.trim() : "";

  if (trimmedNote.length > MAX_DETAILS_LENGTH) {
    throw createServiceError(`A nota deve ter no máximo ${MAX_DETAILS_LENGTH} caracteres.`, 400);
  }

  const [result] = await db
    .promise()
    .query(
      `
        UPDATE chat_reports
        SET status = ?, reviewed_by_user_id = ?, resolution_note = ?, resolved_at = NOW(), updated_at = NOW()
        WHERE id = ?
      `,
      [status, adminUserId, trimmedNote || null, reportId]
    );

  if (result.affectedRows === 0) {
    throw createServiceError("Report não encontrado.", 404);
  }

  return { reportId, status };
}

/**
 * Soft-delete only, never a hard DELETE -- deleted_at/deleted_by_user_id
 * is what turns a message into a placeholder for regular participants
 * while authorized supervision (chatAccessService.listMessagesForSupervisor)
 * still sees the original. Two ways in: the sender removing their own
 * message needs no permission beyond authorship; anyone else needs
 * the same supervision permission that gates reading the conversation
 * in the first place -- deleting someone else's content in a modality
 * you can't even supervise would be a bigger privilege escalation than
 * reading it. Idempotent: deleting an already-deleted message is a
 * silent no-op.
 */
async function deleteMessage(db, { messageId, userId }) {
  const runner = db.promise();

  const [messageRows] = await runner.query(
    `SELECT id, conversation_id, sender_user_id, deleted_at FROM chat_messages WHERE id = ? LIMIT 1`,
    [messageId]
  );

  if (messageRows.length === 0) {
    throw createServiceError("Mensagem não encontrada.", 404);
  }

  const message = messageRows[0];

  if (message.deleted_at) {
    return { messageId, deleted: true };
  }

  if (message.sender_user_id !== userId) {
    const conversationType = await getConversationTypeOrThrow(runner, message.conversation_id);
    const allowed = await canSuperviseConversation(runner, { adminUserId: userId, conversationType });

    if (!allowed) {
      throw createServiceError("Você não pode remover esta mensagem.", 403);
    }
  }

  await runner.query(`UPDATE chat_messages SET deleted_at = NOW(), deleted_by_user_id = ? WHERE id = ?`, [
    userId,
    messageId,
  ]);

  return { messageId, deleted: true };
}

module.exports = {
  ALLOWED_REASONS,
  ALLOWED_REVIEW_STATUSES,
  reportMessage,
  listReports,
  reviewReport,
  deleteMessage,
};
