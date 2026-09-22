/**
 * Etapa 14: operational visibility for the notification/email outbox
 * and the chat moderation/attendance queues. None of these workers
 * (notificationEmailWorker.js, scheduledRemindersWorker.js) run
 * inside the API process -- they're separate `npm run worker:*`
 * processes an operator has to actually keep running. Without a view
 * like this, a stopped worker fails completely silently: deliveries
 * just accumulate as 'pending' forever and nobody notices until a
 * user complains an email never arrived. This endpoint is read-only
 * and cheap (a handful of COUNT/MIN queries), safe to poll from an
 * admin dashboard.
 */

const STUCK_PROCESSING_MINUTES = 30;
const STALE_PENDING_MINUTES = 15;

async function getNotificationOutboxHealth(db) {
  const [rows] = await db.promise().query(
    `
      SELECT
        (SELECT COUNT(*) FROM notification_deliveries WHERE status = 'pending') AS pending,
        (SELECT COUNT(*) FROM notification_deliveries WHERE status = 'processing') AS processing,
        (SELECT COUNT(*) FROM notification_deliveries WHERE status = 'failed') AS failed,
        (SELECT COUNT(*) FROM notification_deliveries
          WHERE status = 'sent' AND sent_at >= NOW() - INTERVAL 24 HOUR) AS sent_last_24h,
        (SELECT MIN(created_at) FROM notification_deliveries WHERE status = 'pending') AS oldest_pending_created_at,
        (SELECT COUNT(*) FROM notification_deliveries
          WHERE status = 'processing' AND locked_at < NOW() - INTERVAL ${STUCK_PROCESSING_MINUTES} MINUTE) AS stuck_processing,
        (SELECT COUNT(*) FROM notification_deliveries
          WHERE status = 'pending' AND next_attempt_at < NOW() - INTERVAL ${STALE_PENDING_MINUTES} MINUTE) AS stale_pending
    `
  );

  const row = rows[0] || {};

  return {
    pending: Number(row.pending || 0),
    processing: Number(row.processing || 0),
    failed: Number(row.failed || 0),
    sentLast24h: Number(row.sent_last_24h || 0),
    oldestPendingCreatedAt: row.oldest_pending_created_at,
    // Non-zero here almost always means the email worker isn't
    // running (or crashed mid-batch, in claimBatch's lease-abandoned
    // sense) -- a healthy worker keeps this near zero by picking up
    // due/abandoned rows within its own poll interval.
    stuckProcessing: Number(row.stuck_processing || 0),
    stalePending: Number(row.stale_pending || 0),
  };
}

async function getScheduledRemindersHealth(db) {
  const [rows] = await db.promise().query(
    `
      SELECT
        (SELECT COUNT(*) FROM invoice_collection_actions WHERE status = 'pending' AND scheduled_for <= CURDATE()) AS due_unprocessed,
        (SELECT MAX(processed_at) FROM invoice_collection_actions WHERE status = 'processed') AS last_processed_at
    `
  );

  const row = rows[0] || {};

  return {
    // A growing count here means scheduledRemindersWorker.js isn't
    // running -- due collection actions (reminders/overdue/lock
    // warnings) pile up unprocessed, same failure shape as the email
    // outbox above but one domain over.
    dueUnprocessed: Number(row.due_unprocessed || 0),
    lastProcessedAt: row.last_processed_at,
  };
}

async function getChatQueueHealth(db) {
  const [rows] = await db.promise().query(
    `
      SELECT
        (SELECT COUNT(*) FROM chat_conversations
          WHERE type = 'administrative_support' AND assigned_user_id IS NULL AND status NOT IN ('resolved', 'closed')) AS unassigned_administrative_tickets,
        (SELECT COUNT(*) FROM chat_conversations
          WHERE type = 'staff_support' AND assigned_user_id IS NULL AND status NOT IN ('resolved', 'closed')) AS unassigned_staff_tickets,
        (SELECT COUNT(*) FROM chat_reports WHERE status = 'open') AS open_reports
    `
  );

  const row = rows[0] || {};

  return {
    unassignedAdministrativeTickets: Number(row.unassigned_administrative_tickets || 0),
    unassignedStaffTickets: Number(row.unassigned_staff_tickets || 0),
    openReports: Number(row.open_reports || 0),
  };
}

/**
 * Status não sensível da configuração do gateway de pagamento --
 * qual provider está ativo e se ele parece configurado, nunca os
 * valores das credenciais em si ou qualquer parte deles (nem mesmo
 * um prefixo/sufixo, para manter este endpoint seguro para ser
 * consultado por um dashboard admin sem virar um lugar por onde
 * segredos poderiam vazar).
 */
function getPaymentGatewayHealth() {
  const gateway = process.env.PAYMENT_GATEWAY || "simulated";

  const configured =
    gateway === "simulated"
      ? true
      : Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN) && Boolean(process.env.MERCADO_PAGO_WEBHOOK_SECRET);

  return { gateway, configured };
}

async function getSystemHealth(db) {
  const [notificationOutbox, scheduledReminders, chatQueues] = await Promise.all([
    getNotificationOutboxHealth(db),
    getScheduledRemindersHealth(db),
    getChatQueueHealth(db),
  ]);

  return {
    notificationOutbox,
    scheduledReminders,
    chatQueues,
    paymentGateway: getPaymentGatewayHealth(),
    checkedAt: new Date().toISOString(),
  };
}

module.exports = { getSystemHealth, getPaymentGatewayHealth };
