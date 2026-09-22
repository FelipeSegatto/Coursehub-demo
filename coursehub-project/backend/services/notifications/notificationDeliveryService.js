const { withTransaction } = require("../../utils/dbTransaction");

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_DELAYS_MINUTES = [5, 30, 120, 720]; // after attempts 1,2,3,4 -- attempt 5 exhausts

function getMaxAttempts() {
  const configured = Number(process.env.NOTIFICATION_WORKER_MAX_ATTEMPTS);

  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_ATTEMPTS;
}

function getRetryDelaysMinutes() {
  const configured = process.env.NOTIFICATION_WORKER_RETRY_DELAYS_MINUTES;

  if (!configured) {
    return DEFAULT_RETRY_DELAYS_MINUTES;
  }

  const parsed = configured
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value >= 0);

  return parsed.length > 0 ? parsed : DEFAULT_RETRY_DELAYS_MINUTES;
}

/**
 * Claims up to `batchSize` deliveries that are either due
 * (status='pending', next_attempt_at <= now) or abandoned by a
 * crashed worker (status='processing', lease older than
 * `leaseMinutes`). FOR UPDATE SKIP LOCKED means two workers racing
 * this same query never claim the same row -- whichever wins the
 * row lock skips it for the other, no application-level mutex
 * needed. Everything happens in one transaction so the claim
 * (SELECT + UPDATE to 'processing') is atomic.
 */
async function claimBatch(db, { batchSize, workerId, leaseMinutes }) {
  return withTransaction(db, async (connection) => {
    const [rows] = await connection.query(
      `
        SELECT
          nd.id AS delivery_id,
          nd.attempt_count,
          nd.destination_snapshot,

          n.type,
          n.title,
          n.message,
          n.priority,

          nr.id AS recipient_id,
          nr.user_id,
          nr.action_path

        FROM notification_deliveries nd
        INNER JOIN notification_recipients nr ON nr.id = nd.recipient_id
        INNER JOIN notifications n ON n.id = nr.notification_id
        WHERE nd.channel = 'email'
          AND (
            (nd.status = 'pending' AND nd.next_attempt_at <= NOW())
            OR (nd.status = 'processing' AND nd.locked_at <= NOW() - INTERVAL ? MINUTE)
          )
        ORDER BY nd.next_attempt_at ASC
        LIMIT ?
        FOR UPDATE SKIP LOCKED
      `,
      [leaseMinutes, batchSize]
    );

    if (rows.length === 0) {
      return [];
    }

    const ids = rows.map((row) => row.delivery_id);

    await connection.query(
      `
        UPDATE notification_deliveries
        SET status = 'processing', locked_at = NOW(), locked_by = ?, updated_at = NOW()
        WHERE id IN (${ids.map(() => "?").join(",")})
      `,
      [workerId, ...ids]
    );

    return rows;
  });
}

async function markDeliverySent(db, { deliveryId, providerMessageId }) {
  await db.promise().query(
    `
      UPDATE notification_deliveries
      SET status = 'sent',
          sent_at = NOW(),
          provider_message_id = ?,
          attempt_count = attempt_count + 1,
          locked_at = NULL,
          locked_by = NULL,
          last_error = NULL,
          updated_at = NOW()
      WHERE id = ?
    `,
    [providerMessageId ?? null, deliveryId]
  );
}

/**
 * `errorMessage` is stored as-is in last_error (max 500 chars,
 * truncated here) -- callers must pass a generic SMTP/transport
 * error string, never the recipient's email or the notification
 * body.
 */
async function markDeliveryFailed(db, { deliveryId, previousAttemptCount, errorMessage }) {
  const maxAttempts = getMaxAttempts();
  const retryDelays = getRetryDelaysMinutes();

  const newAttemptCount = previousAttemptCount + 1;
  const exhausted = newAttemptCount >= maxAttempts;

  const delayIndex = Math.min(newAttemptCount - 1, retryDelays.length - 1);
  const delayMinutes = retryDelays[delayIndex];

  const truncatedError = String(errorMessage ?? "Unknown delivery error").slice(0, 500);

  // next_attempt_at is computed with MySQL's own NOW() + INTERVAL,
  // not a JS Date, for the same reason as notificationService.js's
  // insert -- see the comment there.
  await db.promise().query(
    `
      UPDATE notification_deliveries
      SET attempt_count = ?,
          status = ?,
          next_attempt_at = IF(?, NOW() + INTERVAL ? MINUTE, NULL),
          locked_at = NULL,
          locked_by = NULL,
          last_error = ?,
          updated_at = NOW()
      WHERE id = ?
    `,
    [
      newAttemptCount,
      exhausted ? "failed" : "pending",
      exhausted ? 0 : 1,
      delayMinutes,
      truncatedError,
      deliveryId,
    ]
  );

  return { exhausted, newAttemptCount };
}

/**
 * Apaga o action_path de um destinatário depois de uma entrega bem
 * sucedida -- só chamado pelo worker quando o tipo de notificação está
 * marcado sensitiveActionPath (ver notificationTypeRegistry.js) E o
 * destinatário é externo (sem user_id, então nunca lê o próprio inbox
 * in-app). Depois disso, o valor bruto (que podia embutir um token de
 * uso único) não fica mais recuperável a partir de
 * notification_recipients -- compartilhar o link de novo sempre exige
 * gerar um token novo.
 */
async function clearRecipientActionPath(db, recipientId) {
  await db.promise().query(`UPDATE notification_recipients SET action_path = NULL WHERE id = ?`, [
    recipientId,
  ]);
}

module.exports = {
  createServiceError,
  claimBatch,
  markDeliverySent,
  markDeliveryFailed,
  clearRecipientActionPath,
  getMaxAttempts,
  getRetryDelaysMinutes,
};
