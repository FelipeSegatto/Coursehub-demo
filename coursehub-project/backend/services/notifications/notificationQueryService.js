function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

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

/**
 * Only ever exposes what the recipient's own row + its notification
 * are allowed to show them -- no email, no raw metadata, no
 * delivery/outbox internals. `id` here is notification_recipients.id
 * (the per-user row), not notifications.id, since that's what
 * read/archive act on server-side; the public field is still called
 * `notificationId` in the response to keep the route param name
 * (:notificationId) meaningful to the client.
 */
function mapInboxRow(row) {
  return {
    recipientId: row.recipient_id,
    notificationId: row.notification_id,
    type: row.type,
    category: row.category,
    priority: row.priority,
    title: row.title,
    message: row.message,
    actionPath: row.action_path,
    createdAt: row.created_at,
    readAt: row.read_at,
    archivedAt: row.archived_at,
  };
}

/**
 * Cursor pagination by notification_recipients.id, descending
 * (never OFFSET). `cursor` is the last id seen by the client;
 * results are strictly older than it.
 */
async function listInbox(
  db,
  { userId, cursor, limit, status = "all", category, includeArchived = false }
) {
  const normalizedLimit = normalizeLimit(limit);
  const normalizedCursor = normalizeCursor(cursor);

  if (!["all", "unread", "read"].includes(status)) {
    throw createServiceError("Filtro de status inválido.", 400);
  }

  const conditions = ["nr.user_id = ?"];
  const params = [userId];

  if (!includeArchived) {
    conditions.push("nr.archived_at IS NULL");
  }

  if (status === "unread") {
    conditions.push("nr.read_at IS NULL");
  } else if (status === "read") {
    conditions.push("nr.read_at IS NOT NULL");
  }

  if (category) {
    conditions.push("n.category = ?");
    params.push(category);
  }

  if (normalizedCursor) {
    conditions.push("nr.id < ?");
    params.push(normalizedCursor);
  }

  const whereClause = conditions.join(" AND ");

  const [rows] = await db.promise().query(
    `
      SELECT
        nr.id AS recipient_id,
        nr.notification_id,
        nr.action_path,
        nr.read_at,
        nr.archived_at,
        nr.created_at,

        n.type,
        n.category,
        n.priority,
        n.title,
        n.message

      FROM notification_recipients nr
      INNER JOIN notifications n ON n.id = nr.notification_id
      WHERE ${whereClause}
      ORDER BY nr.id DESC
      LIMIT ?
    `,
    [...params, normalizedLimit + 1]
  );

  const hasMore = rows.length > normalizedLimit;
  const pageRows = hasMore ? rows.slice(0, normalizedLimit) : rows;

  return {
    items: pageRows.map(mapInboxRow),
    nextCursor: hasMore ? pageRows[pageRows.length - 1].recipient_id : null,
  };
}

async function getUnreadCount(db, { userId }) {
  const [rows] = await db.promise().query(
    `
      SELECT COUNT(*) AS total
      FROM notification_recipients
      WHERE user_id = ? AND read_at IS NULL AND archived_at IS NULL
    `,
    [userId]
  );

  return { unreadCount: Number(rows[0]?.total || 0) };
}

/**
 * Scoped entirely by the WHERE clause (notification_id + user_id) --
 * a recipient row that isn't the caller's, or doesn't exist, both
 * affect 0 rows, and both get the same 404. This is what keeps the
 * route from being usable to enumerate other users' notifications.
 */
async function markAsRead(db, { userId, notificationId }) {
  const [result] = await db.promise().query(
    `
      UPDATE notification_recipients
      SET read_at = NOW()
      WHERE notification_id = ? AND user_id = ? AND read_at IS NULL
    `,
    [notificationId, userId]
  );

  if (result.affectedRows === 0) {
    const [existsRows] = await db.promise().query(
      `SELECT id FROM notification_recipients WHERE notification_id = ? AND user_id = ? LIMIT 1`,
      [notificationId, userId]
    );

    if (existsRows.length === 0) {
      throw createServiceError("Notificação não encontrada.", 404);
    }

    // Already read -- idempotent no-op, not an error.
  }

  return { notificationId };
}

async function markAllAsRead(db, { userId }) {
  const [result] = await db.promise().query(
    `
      UPDATE notification_recipients
      SET read_at = NOW()
      WHERE user_id = ? AND read_at IS NULL AND archived_at IS NULL
    `,
    [userId]
  );

  return { updated: result.affectedRows };
}

async function archiveNotification(db, { userId, notificationId }) {
  const [result] = await db.promise().query(
    `
      UPDATE notification_recipients
      SET archived_at = NOW()
      WHERE notification_id = ? AND user_id = ? AND archived_at IS NULL
    `,
    [notificationId, userId]
  );

  if (result.affectedRows === 0) {
    const [existsRows] = await db.promise().query(
      `SELECT id FROM notification_recipients WHERE notification_id = ? AND user_id = ? LIMIT 1`,
      [notificationId, userId]
    );

    if (existsRows.length === 0) {
      throw createServiceError("Notificação não encontrada.", 404);
    }
  }

  return { notificationId };
}

module.exports = {
  createServiceError,
  listInbox,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  archiveNotification,
};
