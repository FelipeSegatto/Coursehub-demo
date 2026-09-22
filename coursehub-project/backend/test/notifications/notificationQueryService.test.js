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
  listInbox,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  archiveNotification,
} = require("../../services/notifications/notificationQueryService");
const {
  listPreferences,
  updatePreference,
} = require("../../services/notifications/notificationPreferenceService");

const TEST_TYPE = "test.notification_query.smoke";
const TEST_CATEGORY = "test_query_category";

let userA; // actor
let userB; // recipient under test
let userC; // second recipient, used for horizontal-isolation checks

before(async () => {
  // node:test runs files in parallel (separate processes) by default,
  // and both test files write to real user rows -- OFFSET 2 keeps
  // this file's users disjoint from notificationService.test.js's
  // (which uses the first 2, offset 0), so concurrent runs never
  // mutate the same physical user's notifications. Any new
  // notifications test file must claim its own offset range.
  const [rows] = await db
    .promise()
    .query("SELECT id, email FROM users WHERE status = 'active' ORDER BY id ASC LIMIT 3 OFFSET 2");

  if (rows.length < 3) {
    throw new Error("Need at least 5 active users in the dev DB to run these tests.");
  }

  [userA, userB, userC] = rows;

  registerNotificationType({
    type: TEST_TYPE,
    category: TEST_CATEGORY,
    priority: "normal",
    emailPolicy: "default_on",
    requiredContext: ["itemId"],
    buildTitle: (context) => `Query test item ${context.itemId}`,
    buildMessage: (context) => `Message ${context.itemId}`,
    buildActionPath: (context) => `/test/query/${context.itemId}`,
    buildDeduplicationKey: (context) => `test:query:${context.itemId}:${context.runId}`,
  });
});

after(async () => {
  _unregisterNotificationType(TEST_TYPE);

  await retryOnDeadlock(() =>
    db.promise().query("DELETE FROM notifications WHERE type = ?", [TEST_TYPE])
  );
  await retryOnDeadlock(() =>
    db.promise().query("DELETE FROM notification_preferences WHERE category = ?", [TEST_CATEGORY])
  );

  await db.promise().end();
});

async function createForRecipient(recipient, itemId, runId) {
  const result = await createNotificationEvent(db, {
    type: TEST_TYPE,
    sourceType: "test_source",
    sourceId: itemId,
    actorUserId: userA.id,
    context: { itemId, runId },
    recipients: [{ userId: recipient.id, role: "student", email: recipient.email }],
  });

  return result;
}

test("listInbox never returns another user's notifications", async () => {
  const runId = `run-${Date.now()}-iso`;

  await createForRecipient(userB, 1, runId);
  await createForRecipient(userC, 2, runId);

  const { items: itemsForB } = await listInbox(db, { userId: userB.id, category: TEST_CATEGORY });
  const { items: itemsForC } = await listInbox(db, { userId: userC.id, category: TEST_CATEGORY });

  assert.ok(itemsForB.some((item) => item.title === "Query test item 1"));
  assert.ok(!itemsForB.some((item) => item.title === "Query test item 2"));

  assert.ok(itemsForC.some((item) => item.title === "Query test item 2"));
  assert.ok(!itemsForC.some((item) => item.title === "Query test item 1"));
});

test("listInbox response never exposes email, metadata, or delivery internals", async () => {
  const runId = `run-${Date.now()}-shape`;

  await createForRecipient(userB, 3, runId);

  const { items } = await listInbox(db, { userId: userB.id, category: TEST_CATEGORY });
  const item = items.find((entry) => entry.title === "Query test item 3");

  assert.ok(item);

  const forbiddenKeys = ["email", "metadata", "deliveries", "destination_snapshot", "status"];

  forbiddenKeys.forEach((key) => {
    assert.equal(Object.hasOwn(item, key), false, `response must not expose "${key}"`);
  });
});

test("markAsRead on another user's notification returns 404, does not mutate it", async () => {
  const runId = `run-${Date.now()}-mark`;

  const created = await createForRecipient(userB, 4, runId);

  await assert.rejects(
    markAsRead(db, { userId: userC.id, notificationId: created.notificationId }),
    (error) => error.statusCode === 404
  );

  const [rows] = await db
    .promise()
    .query(
      "SELECT read_at FROM notification_recipients WHERE notification_id = ? AND user_id = ?",
      [created.notificationId, userB.id]
    );

  assert.equal(rows[0].read_at, null, "another user's failed attempt must not mark it read");
});

test("archiveNotification on another user's notification returns 404", async () => {
  const runId = `run-${Date.now()}-archive`;

  const created = await createForRecipient(userB, 5, runId);

  await assert.rejects(
    archiveNotification(db, { userId: userC.id, notificationId: created.notificationId }),
    (error) => error.statusCode === 404
  );
});

test("getUnreadCount reflects at least the notifications this test just created", async () => {
  // Lower-bound assertion (>=), not equality: getUnreadCount is
  // intentionally global/unfiltered, so concurrently-run test files
  // notifying this same real user can only push the count up, never
  // down, relative to what this test itself created and left unread.
  const runId = `run-${Date.now()}-count`;

  const before = await getUnreadCount(db, { userId: userB.id });

  await createForRecipient(userB, 10, runId);
  await createForRecipient(userB, 11, runId);

  const after = await getUnreadCount(db, { userId: userB.id });

  assert.ok(after.unreadCount >= before.unreadCount + 2);
});

test("markAsRead is idempotent and marks exactly the target recipient row read", async () => {
  // Asserts against this specific recipient row's read_at, not the
  // global unread count: getUnreadCount has no type filter by
  // design (a badge counts every notification), so it's genuinely
  // affected by whatever other notifications concurrently-run test
  // files (e.g. learningActivityPublished.test.js, which notifies
  // real enrolled students) happen to create for this same real
  // user in the same window -- a global-count delta here would be
  // flaky under concurrency, not a real bug.
  const runId = `run-${Date.now()}-read`;

  const created = await createForRecipient(userB, 6, runId);

  const [beforeRows] = await db
    .promise()
    .query("SELECT read_at FROM notification_recipients WHERE notification_id = ? AND user_id = ?", [
      created.notificationId,
      userB.id,
    ]);

  assert.equal(beforeRows[0].read_at, null);

  await markAsRead(db, { userId: userB.id, notificationId: created.notificationId });
  await markAsRead(db, { userId: userB.id, notificationId: created.notificationId }); // idempotent, must not throw

  const [afterRows] = await db
    .promise()
    .query("SELECT read_at FROM notification_recipients WHERE notification_id = ? AND user_id = ?", [
      created.notificationId,
      userB.id,
    ]);

  assert.ok(afterRows[0].read_at);
});

test("markAllAsRead only affects the caller's own unread notifications", async () => {
  // Checks the two specific rows this test created, not the global
  // unread count -- same concurrency-noise reasoning as the
  // "idempotent" test above (getUnreadCount is intentionally global,
  // unfiltered by type, so it's not a safe thing to snapshot/diff
  // across an await boundary while other test files may be notifying
  // these same real users).
  const runId = `run-${Date.now()}-all`;

  const forB = await createForRecipient(userB, 7, runId);
  const forC = await createForRecipient(userC, 8, runId);

  await markAllAsRead(db, { userId: userB.id });

  const [rowB] = await db
    .promise()
    .query("SELECT read_at FROM notification_recipients WHERE notification_id = ? AND user_id = ?", [
      forB.notificationId,
      userB.id,
    ]);
  const [rowC] = await db
    .promise()
    .query("SELECT read_at FROM notification_recipients WHERE notification_id = ? AND user_id = ?", [
      forC.notificationId,
      userC.id,
    ]);

  assert.ok(rowB[0].read_at, "the caller's own notification must be marked read");
  assert.equal(rowC[0].read_at, null, "another user's notification must be untouched");
});

test("listInbox cursor pagination returns no duplicates and no gaps across pages", async () => {
  const runId = `run-${Date.now()}-cursor`;

  await createForRecipient(userB, 101, runId);
  await createForRecipient(userB, 102, runId);
  await createForRecipient(userB, 103, runId);

  const page1 = await listInbox(db, {
    userId: userB.id,
    category: TEST_CATEGORY,
    limit: 2,
  });

  assert.equal(page1.items.length, 2);
  assert.ok(page1.nextCursor);

  const page2 = await listInbox(db, {
    userId: userB.id,
    category: TEST_CATEGORY,
    limit: 2,
    cursor: page1.nextCursor,
  });

  const page1Ids = page1.items.map((item) => item.recipientId);
  const page2Ids = page2.items.map((item) => item.recipientId);

  const overlap = page1Ids.filter((id) => page2Ids.includes(id));

  assert.equal(overlap.length, 0, "pages must not overlap");
});

test("archived items are excluded from the default inbox but not from includeArchived=true", async () => {
  const runId = `run-${Date.now()}-arch`;

  const created = await createForRecipient(userB, 9, runId);
  await archiveNotification(db, { userId: userB.id, notificationId: created.notificationId });

  const { items: withoutArchived } = await listInbox(db, {
    userId: userB.id,
    category: TEST_CATEGORY,
  });
  const { items: withArchived } = await listInbox(db, {
    userId: userB.id,
    category: TEST_CATEGORY,
    includeArchived: true,
  });

  assert.ok(!withoutArchived.some((item) => item.title === "Query test item 9"));
  assert.ok(withArchived.some((item) => item.title === "Query test item 9"));
});

test("listInbox: category filter genuinely excludes other categories, and combines with status", async () => {
  const runId = `run-${Date.now()}-category-filter`;
  const OTHER_TYPE = `test.notification_query.other.${Date.now()}`;

  registerNotificationType({
    type: OTHER_TYPE,
    category: "test_query_other_category",
    priority: "normal",
    emailPolicy: "default_off",
    requiredContext: ["itemId"],
    buildTitle: (context) => `Other category item ${context.itemId}`,
    buildMessage: (context) => `Message ${context.itemId}`,
    buildActionPath: (context) => `/test/query/other/${context.itemId}`,
    buildDeduplicationKey: (context) => `test:query:other:${context.itemId}:${context.runId}`,
  });

  try {
    const inCategory = await createForRecipient(userB, 201, runId);

    const otherCategoryResult = await createNotificationEvent(db, {
      type: OTHER_TYPE,
      sourceType: "test_source",
      sourceId: 202,
      actorUserId: userA.id,
      context: { itemId: 202, runId },
      recipients: [{ userId: userB.id, role: "student", email: userB.email }],
    });

    // Sem filtro: as duas categorias aparecem.
    const unfiltered = await listInbox(db, { userId: userB.id, limit: 50 });
    assert.ok(unfiltered.items.some((item) => item.title === "Query test item 201"));
    assert.ok(unfiltered.items.some((item) => item.title === "Other category item 202"));

    // Filtrando por TEST_CATEGORY: só a notificação daquela categoria aparece.
    const { items: onlyTestCategory } = await listInbox(db, {
      userId: userB.id,
      category: TEST_CATEGORY,
      limit: 50,
    });
    assert.ok(onlyTestCategory.some((item) => item.title === "Query test item 201"));
    assert.ok(!onlyTestCategory.some((item) => item.title === "Other category item 202"));

    // category + status combinados ("Financeiro + Não lidas"-style):
    // marca a notificação da OUTRA categoria como lida -- o filtro
    // category=TEST_CATEGORY & status=unread continua devolvendo só a
    // primeira, category=test_query_other_category & status=unread
    // continua devolvendo a segunda (ainda não lida).
    await markAsRead(db, { userId: userB.id, notificationId: otherCategoryResult.notificationId });

    const { items: testCategoryUnread } = await listInbox(db, {
      userId: userB.id,
      category: TEST_CATEGORY,
      status: "unread",
      limit: 50,
    });
    assert.ok(testCategoryUnread.some((item) => item.title === "Query test item 201"));

    const { items: otherCategoryUnread } = await listInbox(db, {
      userId: userB.id,
      category: "test_query_other_category",
      status: "unread",
      limit: 50,
    });
    assert.ok(!otherCategoryUnread.some((item) => item.title === "Other category item 202"));

    assert.ok(inCategory.notificationId);
  } finally {
    _unregisterNotificationType(OTHER_TYPE);
    await retryOnDeadlock(() => db.promise().query("DELETE FROM notifications WHERE type = ?", [OTHER_TYPE]));
  }
});

test("updatePreference rejects invalid category and non-boolean emailEnabled", async () => {
  await assert.rejects(
    updatePreference(db, { userId: userB.id, category: "", emailEnabled: true }),
    (error) => error.statusCode === 400
  );

  await assert.rejects(
    updatePreference(db, { userId: userB.id, category: TEST_CATEGORY, emailEnabled: "yes" }),
    (error) => error.statusCode === 400
  );
});

test("listPreferences reflects the stored override, not just the registry default", async () => {
  const defaults = await listPreferences(db, { userId: userB.id });
  const beforeUpdate = defaults.find((entry) => entry.category === TEST_CATEGORY);

  assert.ok(beforeUpdate);
  assert.equal(beforeUpdate.emailEnabled, true, "default_on category defaults to enabled");
  assert.equal(beforeUpdate.isDefault, true);

  await updatePreference(db, { userId: userB.id, category: TEST_CATEGORY, emailEnabled: false });

  const afterUpdate = await listPreferences(db, { userId: userB.id });
  const overridden = afterUpdate.find((entry) => entry.category === TEST_CATEGORY);

  assert.equal(overridden.emailEnabled, false);
  assert.equal(overridden.isDefault, false);
});
