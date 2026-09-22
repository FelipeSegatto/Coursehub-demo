const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");
const {
  registerNotificationType,
  _unregisterNotificationType,
} = require("../../services/notifications/notificationTypeRegistry");
const { createNotificationEvent } = require("../../services/notifications/notificationService");
const { getSystemHealth } = require("../../services/admin/systemHealthService");
const { openAdministrativeTicket } = require("../../services/chat/chatAdministrativeSupportService");
const { openStaffTicket } = require("../../services/chat/chatStaffSupportService");
const { createMessage } = require("../../services/chat/chatMessageService");
const { reportMessage } = require("../../services/chat/chatModerationService");

require("../../services/notifications/eventDefinitions"); // registers chat.message.received

// node:test runs files in parallel by default -- OFFSET 7 is free
// (see notificationService.test.js's own comment: 0, 2-4, 5-6 are
// already claimed by other notification test files). Chat fixtures
// reuse student 83 / teacher 19, same as chatAdministrativeSupport/
// chatStaffSupport.test.js -- safe because opening a ticket always
// creates a brand new chat_conversations row (no conversation_key
// dedup for these modalities), so there's no cross-file collision
// risk regardless of concurrency.
const TEST_TYPE = "test.system_health.smoke";
const TEST_CATEGORY = "test_system_health";
const STUDENT_USER_ID = 83;
const TEACHER_USER_ID = 19;

let userA; // actor
let userB; // recipient

const createdConversationIds = [];
const createdNotificationIds = [];

before(async () => {
  const [rows] = await db
    .promise()
    .query("SELECT id, email FROM users WHERE status = 'active' ORDER BY id ASC LIMIT 2 OFFSET 7");

  if (rows.length < 2) {
    throw new Error("Need at least 9 active users in the dev DB to run these tests.");
  }

  [userA, userB] = rows;

  registerNotificationType({
    type: TEST_TYPE,
    category: TEST_CATEGORY,
    priority: "normal",
    emailPolicy: "default_on",
    requiredContext: ["itemId"],
    buildTitle: (context) => `Test item ${context.itemId}`,
    buildMessage: (context) => `Test message for item ${context.itemId}`,
    buildActionPath: () => "/test",
    buildDeduplicationKey: (context) => `test:system_health:${context.itemId}:${context.runId}`,
  });
});

after(async () => {
  _unregisterNotificationType(TEST_TYPE);

  if (createdNotificationIds.length > 0) {
    const placeholders = createdNotificationIds.map(() => "?").join(",");

    await retryOnDeadlock(() =>
      db
        .promise()
        .query(
          `DELETE FROM notification_deliveries WHERE recipient_id IN (SELECT id FROM notification_recipients WHERE notification_id IN (${placeholders}))`,
          createdNotificationIds
        )
    );

    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM notification_recipients WHERE notification_id IN (${placeholders})`, createdNotificationIds)
    );

    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM notifications WHERE id IN (${placeholders})`, createdNotificationIds)
    );
  }

  if (createdConversationIds.length > 0) {
    const placeholders = createdConversationIds.map(() => "?").join(",");

    await retryOnDeadlock(() =>
      db.promise().query(
        `DELETE FROM notification_deliveries WHERE recipient_id IN (SELECT id FROM notification_recipients WHERE notification_id IN (SELECT id FROM notifications WHERE source_type = 'chat_conversation' AND source_id IN (${placeholders})))`,
        createdConversationIds
      )
    );

    await retryOnDeadlock(() =>
      db.promise().query(
        `DELETE FROM notification_recipients WHERE notification_id IN (SELECT id FROM notifications WHERE source_type = 'chat_conversation' AND source_id IN (${placeholders}))`,
        createdConversationIds
      )
    );

    await retryOnDeadlock(() =>
      db.promise().query(
        `DELETE FROM notifications WHERE source_type = 'chat_conversation' AND source_id IN (${placeholders})`,
        createdConversationIds
      )
    );

    await retryOnDeadlock(() =>
      db.promise().query(`UPDATE chat_conversations SET last_message_id = NULL WHERE id IN (${placeholders})`, createdConversationIds)
    );

    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM chat_reports WHERE message_id IN (SELECT id FROM chat_messages WHERE conversation_id IN (${placeholders}))`, createdConversationIds)
    );

    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM chat_messages WHERE conversation_id IN (${placeholders})`, createdConversationIds)
    );

    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM chat_participants WHERE conversation_id IN (${placeholders})`, createdConversationIds)
    );

    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM chat_conversations WHERE id IN (${placeholders})`, createdConversationIds)
    );
  }

  await db.promise().end();
});

test("getSystemHealth returns a well-shaped snapshot", async () => {
  const health = await getSystemHealth(db);

  assert.ok(health.notificationOutbox);
  assert.equal(typeof health.notificationOutbox.pending, "number");
  assert.equal(typeof health.notificationOutbox.stuckProcessing, "number");

  assert.ok(health.scheduledReminders);
  assert.equal(typeof health.scheduledReminders.dueUnprocessed, "number");

  assert.ok(health.chatQueues);
  assert.equal(typeof health.chatQueues.unassignedAdministrativeTickets, "number");
  assert.equal(typeof health.chatQueues.unassignedStaffTickets, "number");
  assert.equal(typeof health.chatQueues.openReports, "number");

  assert.ok(health.checkedAt);
});

// Every count getSystemHealth exposes is a genuinely global,
// unfiltered aggregate -- unlike a per-user count (where scoping to
// one disjoint fixture user rules out interference), many other test
// files concurrently create AND clean up their own notifications/
// tickets/reports of the exact same kind throughout their own run,
// so a before/after delta on the aggregate itself (even with >=) is
// not reliable: a concurrent file's cleanup can remove more rows than
// this test just added, in the same window. Each test below instead
// (1) proves the row this test just created genuinely matches the
// same WHERE predicate systemHealthService.js uses -- real regression
// protection against a typo'd column/status in that query -- and (2)
// takes one real measurement through getSystemHealth itself to prove
// the wiring works end to end, without comparing it to a prior
// snapshot.

test("a new default_on notification's delivery is pending, matching the outbox predicate", async () => {
  const result = await createNotificationEvent(db, {
    type: TEST_TYPE,
    sourceType: "test_source",
    actorUserId: userA.id,
    context: { itemId: 1, runId: `run-${Date.now()}` },
    recipients: [{ userId: userB.id, role: "student", email: userB.email }],
  });

  createdNotificationIds.push(result.notificationId);

  // Deliveries are 1:1 with recipients via uk_delivery_recipient_channel.
  const [[delivery]] = await db
    .promise()
    .query(`SELECT status FROM notification_deliveries WHERE recipient_id = ?`, [result.recipientIds[0]]);

  assert.equal(delivery.status, "pending");

  const health = await getSystemHealth(db);

  assert.ok(health.notificationOutbox.pending >= 1);
});

test("stuckProcessing counts a processing delivery whose lease has expired", async () => {
  const result = await createNotificationEvent(db, {
    type: TEST_TYPE,
    sourceType: "test_source",
    actorUserId: userA.id,
    context: { itemId: 2, runId: `run-${Date.now()}` },
    recipients: [{ userId: userB.id, role: "student", email: userB.email }],
  });

  createdNotificationIds.push(result.notificationId);

  await db.promise().query(
    `
      UPDATE notification_deliveries
      SET status = 'processing', locked_at = NOW() - INTERVAL 45 MINUTE, locked_by = 'test-worker'
      WHERE recipient_id = ?
    `,
    [result.recipientIds[0]]
  );

  const [[row]] = await db
    .promise()
    .query(
      `SELECT COUNT(*) AS n FROM notification_deliveries WHERE recipient_id = ? AND status = 'processing' AND locked_at < NOW() - INTERVAL 30 MINUTE`,
      [result.recipientIds[0]]
    );

  assert.equal(row.n, 1);

  const health = await getSystemHealth(db);

  assert.ok(health.notificationOutbox.stuckProcessing >= 1);
});

test("a newly opened, unassigned administrative ticket matches the chat-queue predicate", async () => {
  const { conversationId } = await openAdministrativeTicket(db, {
    userId: STUDENT_USER_ID,
    category: "financial",
    subject: `TEST ETAPA14 subject ${Date.now()}`,
    body: "Preciso de ajuda com minha fatura.",
  });

  createdConversationIds.push(conversationId);

  const [[row]] = await db.promise().query(
    `
      SELECT COUNT(*) AS n FROM chat_conversations
      WHERE id = ? AND type = 'administrative_support' AND assigned_user_id IS NULL AND status NOT IN ('resolved', 'closed')
    `,
    [conversationId]
  );

  assert.equal(row.n, 1);

  const health = await getSystemHealth(db);

  assert.ok(health.chatQueues.unassignedAdministrativeTickets >= 1);
});

test("a newly opened, unassigned staff ticket matches the chat-queue predicate", async () => {
  const { conversationId } = await openStaffTicket(db, {
    userId: TEACHER_USER_ID,
    category: "course",
    subject: `TEST ETAPA14 subject ${Date.now()}`,
    body: "Preciso de orientação.",
  });

  createdConversationIds.push(conversationId);

  const [[row]] = await db.promise().query(
    `
      SELECT COUNT(*) AS n FROM chat_conversations
      WHERE id = ? AND type = 'staff_support' AND assigned_user_id IS NULL AND status NOT IN ('resolved', 'closed')
    `,
    [conversationId]
  );

  assert.equal(row.n, 1);

  const health = await getSystemHealth(db);

  assert.ok(health.chatQueues.unassignedStaffTickets >= 1);
});

test("a newly opened report matches the chat-queue predicate", async () => {
  const { conversationId } = await openAdministrativeTicket(db, {
    userId: STUDENT_USER_ID,
    category: "financial",
    subject: `TEST ETAPA14 subject ${Date.now()}`,
    body: "Preciso de ajuda com minha fatura.",
  });

  createdConversationIds.push(conversationId);

  const message = await createMessage(db, {
    conversationId,
    userId: STUDENT_USER_ID,
    body: "mensagem para reportar",
  });

  await reportMessage(db, { messageId: message.messageId, reporterUserId: STUDENT_USER_ID, reason: "other" });

  const [[row]] = await db
    .promise()
    .query(`SELECT COUNT(*) AS n FROM chat_reports WHERE message_id = ? AND status = 'open'`, [message.messageId]);

  assert.equal(row.n, 1);

  const health = await getSystemHealth(db);

  assert.ok(health.chatQueues.openReports >= 1);
});
