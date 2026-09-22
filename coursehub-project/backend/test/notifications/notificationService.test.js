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

const TEST_TYPE = "test.notification_service.smoke";
const TEST_CATEGORY = "test_category";

let userA; // used as actor
let userB; // used as recipient

before(async () => {
  // node:test runs files in parallel (separate processes) by
  // default. This file owns OFFSET 0 (first 2 active users) --
  // other notifications test files must use a disjoint OFFSET so
  // concurrent runs never mutate the same physical user's rows.
  const [rows] = await db.promise().query(
    "SELECT id, email FROM users WHERE status = 'active' ORDER BY id ASC LIMIT 2 OFFSET 0"
  );

  if (rows.length < 2) {
    throw new Error("Need at least 2 active users in the dev DB to run these tests.");
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
    buildActionPath: (context) => `/test/items/${context.itemId}`,
    buildDeduplicationKey: (context) => `test:item:${context.itemId}:${context.runId}`,
  });
});

after(async () => {
  _unregisterNotificationType(TEST_TYPE);

  // Exact type match, not a 'test.%' LIKE -- other notifications test
  // files run concurrently in their own process and must not have
  // their still-in-flight rows deleted by this file's cleanup.
  await retryOnDeadlock(() =>
    db.promise().query("DELETE FROM notifications WHERE type IN (?, ?)", [
      TEST_TYPE,
      "test.notification_service.essential",
    ])
  );
  await retryOnDeadlock(() =>
    db.promise().query("DELETE FROM notification_preferences WHERE category IN (?, ?)", [
      TEST_CATEGORY,
      "test_essential",
    ])
  );

  await db.promise().end();
});

test("registry rejects a type definition missing required fields", () => {
  assert.throws(() => {
    registerNotificationType({ type: "test.invalid" });
  }, /requires/);
});

test("createNotificationEvent creates notification + recipient + email delivery", async () => {
  const runId = `run-${Date.now()}-a`;

  const result = await createNotificationEvent(db, {
    type: TEST_TYPE,
    sourceType: "test_source",
    sourceId: 1,
    actorUserId: userA.id,
    context: { itemId: 1, runId },
    recipients: [{ userId: userB.id, role: "student", email: userB.email }],
  });

  assert.equal(result.deduplicated, false);
  assert.ok(result.notificationId > 0);
  assert.equal(result.recipientIds.length, 1);

  const [notificationRows] = await db
    .promise()
    .query("SELECT * FROM notifications WHERE id = ?", [result.notificationId]);

  assert.equal(notificationRows.length, 1);
  assert.equal(notificationRows[0].title, "Test item 1");
  assert.equal(notificationRows[0].category, TEST_CATEGORY);

  const [deliveryRows] = await db
    .promise()
    .query("SELECT * FROM notification_deliveries WHERE recipient_id = ?", [
      result.recipientIds[0],
    ]);

  assert.equal(deliveryRows.length, 1);
  assert.equal(deliveryRows[0].status, "pending");
  assert.equal(deliveryRows[0].destination_snapshot, userB.email);
});

test("createNotificationEvent is idempotent on the same deduplication key", async () => {
  const runId = `run-${Date.now()}-b`;
  const context = { itemId: 2, runId };
  const recipients = [{ userId: userB.id, role: "student", email: userB.email }];

  const first = await createNotificationEvent(db, {
    type: TEST_TYPE,
    sourceType: "test_source",
    sourceId: 2,
    actorUserId: userA.id,
    context,
    recipients,
  });

  const second = await createNotificationEvent(db, {
    type: TEST_TYPE,
    sourceType: "test_source",
    sourceId: 2,
    actorUserId: userA.id,
    context,
    recipients,
  });

  assert.equal(first.deduplicated, false);
  assert.equal(second.deduplicated, true);
  assert.equal(second.notificationId, first.notificationId);

  const [countRows] = await db
    .promise()
    .query("SELECT COUNT(*) AS total FROM notifications WHERE id = ?", [first.notificationId]);

  assert.equal(Number(countRows[0].total), 1);

  const [recipientCountRows] = await db
    .promise()
    .query("SELECT COUNT(*) AS total FROM notification_recipients WHERE notification_id = ?", [
      first.notificationId,
    ]);

  assert.equal(Number(recipientCountRows[0].total), 1, "second call must not add a duplicate recipient");
});

test("createNotificationEvent excludes the actor from recipients by default", async () => {
  const runId = `run-${Date.now()}-c`;

  await assert.rejects(
    createNotificationEvent(db, {
      type: TEST_TYPE,
      sourceType: "test_source",
      sourceId: 3,
      actorUserId: userA.id,
      context: { itemId: 3, runId },
      recipients: [{ userId: userA.id, role: "student", email: userA.email }],
    }),
    /zero recipients/
  );
});

test("createNotificationEvent rolls back the notification row when a recipient insert violates a constraint", async () => {
  const runId = `run-${Date.now()}-d`;
  const deduplicationKey = `test:item:4:${runId}`;
  const nonExistentUserId = 999999999;

  await assert.rejects(
    createNotificationEvent(db, {
      type: TEST_TYPE,
      sourceType: "test_source",
      sourceId: 4,
      actorUserId: userA.id,
      context: { itemId: 4, runId },
      recipients: [{ userId: nonExistentUserId, role: "student", email: "ghost@example.com" }],
    })
  );

  const [rows] = await db
    .promise()
    .query("SELECT id FROM notifications WHERE deduplication_key = ?", [deduplicationKey]);

  assert.equal(rows.length, 0, "a failed transaction must not leave the notification row behind");
});

test("notifications.deduplication_key UNIQUE constraint rejects a raw duplicate insert", async () => {
  const key = `test:constraint:${Date.now()}`;

  const insertOne = () =>
    db.promise().query(
      `INSERT INTO notifications
        (type, category, priority, title, message, source_type, deduplication_key, created_at)
       VALUES ('test.constraint', 'test_category', 'normal', 't', 'm', 'test_source', ?, NOW())`,
      [key]
    );

  await insertOne();

  await assert.rejects(insertOne(), (error) => error.code === "ER_DUP_ENTRY");

  await db.promise().query("DELETE FROM notifications WHERE deduplication_key = ?", [key]);
});

test("notification_preferences UNIQUE(user_id, category) rejects a raw duplicate insert", async () => {
  const insertOne = () =>
    db.promise().query(
      `INSERT INTO notification_preferences (user_id, category, email_enabled) VALUES (?, ?, 1)`,
      [userB.id, TEST_CATEGORY]
    );

  await insertOne();

  await assert.rejects(insertOne(), (error) => error.code === "ER_DUP_ENTRY");
});

test("email policy: essential ignores an explicit opt-out", async () => {
  await db
    .promise()
    .query(
      `INSERT INTO notification_preferences (user_id, category, email_enabled) VALUES (?, 'test_essential', 0)`,
      [userB.id]
    );

  registerNotificationType({
    type: "test.notification_service.essential",
    category: "test_essential",
    priority: "urgent",
    emailPolicy: "essential",
    requiredContext: ["itemId"],
    buildTitle: () => "essential",
    buildMessage: () => "essential",
    buildActionPath: () => "/test",
    buildDeduplicationKey: (context) => `test:essential:${context.runId}`,
  });

  try {
    const result = await createNotificationEvent(db, {
      type: "test.notification_service.essential",
      sourceType: "test_source",
      actorUserId: userA.id,
      context: { itemId: 1, runId: `run-${Date.now()}` },
      recipients: [{ userId: userB.id, role: "student", email: userB.email }],
    });

    const [deliveryRows] = await db
      .promise()
      .query("SELECT status FROM notification_deliveries WHERE recipient_id = ?", [
        result.recipientIds[0],
      ]);

    assert.equal(deliveryRows[0].status, "pending");
  } finally {
    _unregisterNotificationType("test.notification_service.essential");
    await db.promise().query("DELETE FROM notification_preferences WHERE category = 'test_essential'");
  }
});
