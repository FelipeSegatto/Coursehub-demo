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
const {
  claimBatch,
  markDeliverySent,
  markDeliveryFailed,
} = require("../../services/notifications/notificationDeliveryService");
const { buildNotificationEmail } = require("../../email/templates/notificationEmail");
const { sendPasswordResetEmail } = require("../../utils/mailer");

const TEST_TYPE = "test.notification_delivery_worker.smoke";
const TEST_CATEGORY = "test_delivery_category";

let userA;
let userB;

before(async () => {
  // Disjoint from notificationService.test.js (offset 0) and
  // notificationQueryService.test.js (offset 2, limit 3) -- see the
  // convention documented in those files.
  const [rows] = await db
    .promise()
    .query("SELECT id, email FROM users WHERE status = 'active' ORDER BY id ASC LIMIT 2 OFFSET 5");

  if (rows.length < 2) {
    throw new Error("Need at least 7 active users in the dev DB to run these tests.");
  }

  [userA, userB] = rows;

  registerNotificationType({
    type: TEST_TYPE,
    category: TEST_CATEGORY,
    priority: "normal",
    emailPolicy: "essential",
    requiredContext: ["itemId"],
    buildTitle: (context) => `Delivery test ${context.itemId}`,
    buildMessage: (context) => `Delivery message ${context.itemId}`,
    buildActionPath: (context) => `/test/delivery/${context.itemId}`,
    buildDeduplicationKey: (context) => `test:delivery:${context.itemId}:${context.runId}`,
  });
});

after(async () => {
  _unregisterNotificationType(TEST_TYPE);

  await retryOnDeadlock(() =>
    db.promise().query("DELETE FROM notifications WHERE type = ?", [TEST_TYPE])
  );

  await db.promise().end();
});

async function createDelivery(itemId, runId) {
  const result = await createNotificationEvent(db, {
    type: TEST_TYPE,
    sourceType: "test_source",
    sourceId: itemId,
    actorUserId: userA.id,
    context: { itemId, runId },
    recipients: [{ userId: userB.id, role: "student", email: userB.email }],
  });

  const [deliveryRows] = await db
    .promise()
    .query("SELECT id FROM notification_deliveries WHERE recipient_id = ?", [
      result.recipientIds[0],
    ]);

  const deliveryId = deliveryRows[0].id;

  // claimBatch orders by next_attempt_at ASC -- with the notification
  // suite now spanning many files that all create real pending
  // deliveries concurrently (learning/financial/calendar events),
  // a same-instant next_attempt_at is no longer enough to guarantee
  // this row lands inside any fixed batchSize. Back-dating it here
  // guarantees first position regardless of how much unrelated
  // contention exists at test time, rather than relying on a
  // generous-enough batchSize (which just gets less reliable as the
  // suite grows).
  await db
    .promise()
    .query("UPDATE notification_deliveries SET next_attempt_at = NOW() - INTERVAL 1 YEAR WHERE id = ?", [
      deliveryId,
    ]);

  return deliveryId;
}

test("buildNotificationEmail escapes HTML but keeps text plain", () => {
  const { html, text, subject } = buildNotificationEmail({
    title: 'Title <script>alert("x")</script>',
    message: "Line one\n<b>bold</b> & unsafe",
    actionPath: "/aluno/notas",
    priority: "urgent",
  });

  assert.ok(!html.includes("<script>alert"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("&amp; unsafe"));
  assert.ok(text.includes("<script>alert")); // plain text is not HTML-escaped
  assert.ok(subject.startsWith("[Urgente]"));
});

test("claimBatch moves a due delivery from pending to processing", async () => {
  const runId = `run-${Date.now()}-claim`;
  const deliveryId = await createDelivery(1, runId);

  // batchSize is intentionally generous: other test files (e.g.
  // learningActivityPublished.test.js) run concurrently and create
  // real 'pending' deliveries for real recipients in the same
  // shared queue -- claimBatch correctly has no per-type filter
  // (production must claim across all types), so a small batchSize
  // here would flakily starve this test's own target row out of the
  // LIMIT window under contention.
  const jobs = await claimBatch(db, { batchSize: 1000, workerId: "test-worker-a", leaseMinutes: 5 });

  assert.ok(jobs.some((job) => job.delivery_id === deliveryId));

  const [rows] = await db
    .promise()
    .query("SELECT status, locked_by FROM notification_deliveries WHERE id = ?", [deliveryId]);

  assert.equal(rows[0].status, "processing");
  assert.equal(rows[0].locked_by, "test-worker-a");
});

test("two concurrent claims never return the same delivery (FOR UPDATE SKIP LOCKED)", async () => {
  const runId = `run-${Date.now()}-race`;
  const idOne = await createDelivery(2, runId);
  const idTwo = await createDelivery(3, runId);

  const [batchA, batchB] = await Promise.all([
    claimBatch(db, { batchSize: 1000, workerId: "worker-a", leaseMinutes: 5 }),
    claimBatch(db, { batchSize: 1000, workerId: "worker-b", leaseMinutes: 5 }),
  ]);

  const claimedIds = [...batchA, ...batchB]
    .map((job) => job.delivery_id)
    .filter((id) => id === idOne || id === idTwo);

  const uniqueClaimedIds = new Set(claimedIds);

  assert.equal(claimedIds.length, uniqueClaimedIds.size, "no delivery claimed by both workers");
  assert.equal(uniqueClaimedIds.size, 2, "both deliveries were claimed exactly once, by someone");
});

test("an expired processing lease becomes claimable again", async () => {
  const runId = `run-${Date.now()}-lease`;
  const deliveryId = await createDelivery(4, runId);

  await claimBatch(db, { batchSize: 1000, workerId: "worker-stale", leaseMinutes: 5 });

  // Simulate a crashed worker: back-date the lock past the lease window.
  await db
    .promise()
    .query("UPDATE notification_deliveries SET locked_at = NOW() - INTERVAL 10 MINUTE WHERE id = ?", [
      deliveryId,
    ]);

  const jobs = await claimBatch(db, { batchSize: 1000, workerId: "worker-recovery", leaseMinutes: 5 });

  assert.ok(jobs.some((job) => job.delivery_id === deliveryId));
});

test("markDeliverySent clears the lock and records the provider id", async () => {
  const runId = `run-${Date.now()}-sent`;
  const deliveryId = await createDelivery(5, runId);

  await claimBatch(db, { batchSize: 1000, workerId: "worker-a", leaseMinutes: 5 });
  await markDeliverySent(db, { deliveryId, providerMessageId: "provider-123" });

  const [rows] = await db
    .promise()
    .query("SELECT status, locked_by, provider_message_id, sent_at FROM notification_deliveries WHERE id = ?", [
      deliveryId,
    ]);

  assert.equal(rows[0].status, "sent");
  assert.equal(rows[0].locked_by, null);
  assert.equal(rows[0].provider_message_id, "provider-123");
  assert.ok(rows[0].sent_at);
});

test("markDeliveryFailed schedules a retry until the 5th failure, which terminates", async () => {
  const runId = `run-${Date.now()}-retry`;
  const deliveryId = await createDelivery(6, runId);

  let attemptCount = 0;

  for (let failureNumber = 1; failureNumber <= 5; failureNumber += 1) {
    const { exhausted, newAttemptCount } = await markDeliveryFailed(db, {
      deliveryId,
      previousAttemptCount: attemptCount,
      errorMessage: `simulated failure ${failureNumber}`,
    });

    attemptCount = newAttemptCount;

    const [rows] = await db
      .promise()
      .query("SELECT status, next_attempt_at FROM notification_deliveries WHERE id = ?", [
        deliveryId,
      ]);

    if (failureNumber < 5) {
      assert.equal(exhausted, false);
      assert.equal(rows[0].status, "pending");
      assert.ok(rows[0].next_attempt_at, `attempt ${failureNumber} must schedule a retry`);
    } else {
      assert.equal(exhausted, true);
      assert.equal(rows[0].status, "failed");
      assert.equal(rows[0].next_attempt_at, null);
    }
  }
});

test("password reset email still works after mailer generalization", async () => {
  const result = await sendPasswordResetEmail({
    to: "smoke-test@example.com",
    resetUrl: "http://localhost:5173/redefinir-senha?token=smoke",
  });

  assert.ok(result.messageId);
});
