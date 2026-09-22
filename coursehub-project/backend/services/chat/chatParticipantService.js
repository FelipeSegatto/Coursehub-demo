function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

/**
 * The single gate every chat read/write goes through. Returns 404
 * (never 403) whether the conversation doesn't exist, the caller was
 * never a participant, or the caller left it -- knowing a
 * conversationId must never be enough to learn anything about it,
 * per the master prompt's own acceptance criteria for this stage.
 */
async function assertParticipant(runner, { conversationId, userId }) {
  const [rows] = await runner.query(
    `
      SELECT id, participant_role, can_post, last_read_message_id, archived_at
      FROM chat_participants
      WHERE conversation_id = ? AND user_id = ? AND left_at IS NULL
      LIMIT 1
    `,
    [conversationId, userId]
  );

  if (rows.length === 0) {
    throw createServiceError("Conversa não encontrada.", 404);
  }

  return {
    participantId: rows[0].id,
    role: rows[0].participant_role,
    canPost: Boolean(rows[0].can_post),
    lastReadMessageId: rows[0].last_read_message_id,
    archivedAt: rows[0].archived_at,
  };
}

async function addParticipant(connection, { conversationId, userId, participantRole, canPost = true }) {
  const [result] = await connection.query(
    `
      INSERT INTO chat_participants (conversation_id, user_id, participant_role, can_post, joined_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, NOW(), NOW(), NOW())
    `,
    [conversationId, userId, participantRole, canPost ? 1 : 0]
  );

  return { participantId: result.insertId };
}

async function ensureParticipant(connection, { conversationId, userId, participantRole, canPost = true }) {
  const [existing] = await connection.query(
    `
      SELECT id, left_at
      FROM chat_participants
      WHERE conversation_id = ? AND user_id = ?
      LIMIT 1
    `,
    [conversationId, userId]
  );

  if (existing.length === 0) {
    return addParticipant(connection, { conversationId, userId, participantRole, canPost });
  }

  if (existing[0].left_at) {
    await connection.query(
      `
        UPDATE chat_participants
        SET left_at = NULL, archived_at = NULL, can_post = ?, participant_role = ?,
            joined_at = NOW(), updated_at = NOW()
        WHERE id = ?
      `,
      [canPost ? 1 : 0, participantRole, existing[0].id]
    );
  }

  return { participantId: existing[0].id };
}

async function leaveParticipant(connection, { conversationId, userId }) {
  await connection.query(
    `
      UPDATE chat_participants
      SET left_at = NOW(), updated_at = NOW()
      WHERE conversation_id = ? AND user_id = ? AND left_at IS NULL
    `,
    [conversationId, userId]
  );
}

async function listParticipants(runner, { conversationId }) {
  const [rows] = await runner.query(
    `
      SELECT
        cp.id, cp.user_id, cp.participant_role, cp.can_post,
        cp.joined_at, cp.left_at, cp.muted_at, cp.archived_at,
        u.name, u.email
      FROM chat_participants cp
      INNER JOIN users u ON u.id = cp.user_id
      WHERE cp.conversation_id = ?
      ORDER BY cp.joined_at ASC
    `,
    [conversationId]
  );

  return rows.map((row) => ({
    participantId: row.id,
    userId: row.user_id,
    role: row.participant_role,
    canPost: Boolean(row.can_post),
    name: row.name,
    email: row.email,
    joinedAt: row.joined_at,
    leftAt: row.left_at,
    mutedAt: row.muted_at,
    archivedAt: row.archived_at,
  }));
}

/**
 * Scoped entirely by the WHERE clause (conversation_id + user_id),
 * same "0 rows affected -> check existence -> 404 either way" shape
 * as notificationQueryService.markAsRead -- a foreign conversationId
 * and a nonexistent one produce the identical response.
 *
 * lastReadMessageId is optional -- omitted, this marks the
 * conversation read up to whatever its current last_message_id is
 * (the common case: "I opened this conversation and saw everything
 * in it"), computed server-side via the join rather than requiring
 * the client to already know the latest message's id. GREATEST(...)
 * against the participant's own current value makes this safe to
 * call with a stale/smaller id too -- it never moves the watermark
 * backwards.
 */
async function markConversationRead(db, { conversationId, userId, lastReadMessageId }) {
  const [result] = await db.promise().query(
    `
      UPDATE chat_participants cp
      INNER JOIN chat_conversations cc ON cc.id = cp.conversation_id
      SET cp.last_read_message_id = GREATEST(
            COALESCE(cp.last_read_message_id, 0),
            COALESCE(?, cc.last_message_id, 0)
          ),
          cp.updated_at = NOW()
      WHERE cp.conversation_id = ? AND cp.user_id = ? AND cp.left_at IS NULL
    `,
    [lastReadMessageId ?? null, conversationId, userId]
  );

  if (result.affectedRows === 0) {
    await assertParticipant(db.promise(), { conversationId, userId });
  }

  return { conversationId };
}

async function archiveConversationForUser(db, { conversationId, userId }) {
  const [result] = await db.promise().query(
    `
      UPDATE chat_participants
      SET archived_at = NOW(), updated_at = NOW()
      WHERE conversation_id = ? AND user_id = ? AND left_at IS NULL AND archived_at IS NULL
    `,
    [conversationId, userId]
  );

  if (result.affectedRows === 0) {
    await assertParticipant(db.promise(), { conversationId, userId });
  }

  return { conversationId };
}

module.exports = {
  createServiceError,
  assertParticipant,
  addParticipant,
  ensureParticipant,
  leaveParticipant,
  listParticipants,
  markConversationRead,
  archiveConversationForUser,
};
