const { test, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();
require("../../services/notifications/eventDefinitions");

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");
const { createContactRequest } = require("../../services/public/publicContactService");
const {
  listContactRequests,
  getContactRequestById,
  updateContactRequestStatus,
} = require("../../services/admin/adminContactService");

const RUN_ID = Date.now();

function testEmail(label) {
  return `test.admincontact.${RUN_ID}.${label}@example.com`;
}

const createdContactIds = [];

async function createTestContact(overrides = {}) {
  const result = await createContactRequest(db, {
    name: "Admin Contact Fixture",
    email: testEmail(`fixture-${createdContactIds.length}`),
    subject: `TEST ADMIN CONTACT subject ${Date.now()}`,
    message: "corpo da mensagem de teste",
    ...overrides,
  });

  createdContactIds.push(result.id);

  return result.id;
}

async function cleanupContact(contactId) {
  const [notifs] = await db
    .promise()
    .query(`SELECT id FROM notifications WHERE source_type = 'public_contact_request' AND source_id = ?`, [
      contactId,
    ]);

  for (const notification of notifs) {
    await retryOnDeadlock(() =>
      db
        .promise()
        .query(
          `DELETE FROM notification_deliveries WHERE recipient_id IN (SELECT id FROM notification_recipients WHERE notification_id = ?)`,
          [notification.id]
        )
    );
    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM notification_recipients WHERE notification_id = ?`, [notification.id])
    );
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM notifications WHERE id = ?`, [notification.id]));
  }

  await retryOnDeadlock(() => db.promise().query(`DELETE FROM public_contact_requests WHERE id = ?`, [contactId]));
}

after(async () => {
  for (const contactId of createdContactIds) {
    await cleanupContact(contactId);
  }

  await db.promise().end();
});

test("listContactRequests filters by status", async () => {
  const contactId = await createTestContact();

  const newOnly = await listContactRequests(db, { status: "new", limit: 100 });
  assert.ok(newOnly.data.some((item) => item.id === contactId));

  await updateContactRequestStatus(db, contactId, "resolved");

  const newOnlyAfter = await listContactRequests(db, { status: "new", limit: 100 });
  assert.equal(
    newOnlyAfter.data.some((item) => item.id === contactId),
    false
  );

  const resolvedOnly = await listContactRequests(db, { status: "resolved", limit: 100 });
  assert.ok(resolvedOnly.data.some((item) => item.id === contactId));
});

test("listContactRequests filters by search (nome/e-mail/assunto)", async () => {
  const uniqueSubject = `TEST ADMIN CONTACT UNIQUE SUBJECT ${Date.now()}`;
  const contactId = await createTestContact({ subject: uniqueSubject });

  const result = await listContactRequests(db, { search: uniqueSubject, limit: 100 });

  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].id, contactId);
});

test("listContactRequests rejects an invalid status filter", async () => {
  await assert.rejects(
    () => listContactRequests(db, { status: "not_a_real_status" }),
    (error) => error.statusCode === 400
  );
});

test("updateContactRequestStatus: new -> read -> resolved, cada transição persiste", async () => {
  const contactId = await createTestContact();

  const afterRead = await updateContactRequestStatus(db, contactId, "read");
  assert.equal(afterRead.status, "read");

  const afterResolved = await updateContactRequestStatus(db, contactId, "resolved");
  assert.equal(afterResolved.status, "resolved");

  const fetched = await getContactRequestById(db, contactId);
  assert.equal(fetched.status, "resolved");
});

test("updateContactRequestStatus rejects an invalid status", async () => {
  const contactId = await createTestContact();

  await assert.rejects(
    () => updateContactRequestStatus(db, contactId, "not_a_real_status"),
    (error) => error.statusCode === 400
  );
});

test("updateContactRequestStatus/getContactRequestById 404 for an id that doesn't exist", async () => {
  await assert.rejects(
    () => updateContactRequestStatus(db, 999999999, "read"),
    (error) => error.statusCode === 404
  );

  await assert.rejects(
    () => getContactRequestById(db, 999999999),
    (error) => error.statusCode === 404
  );
});
