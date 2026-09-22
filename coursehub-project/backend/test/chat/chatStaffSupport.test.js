const { test, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");
require("../../services/notifications/eventDefinitions"); // registers chat.message.received
const {
  openStaffTicket,
  openStaffConversation,
  listStaffQueue,
  assignStaffTicket,
} = require("../../services/chat/chatStaffSupportService");
const { resolveConversation } = require("../../services/chat/chatConversationService");
const { createMessage } = require("../../services/chat/chatMessageService");

// Real, pre-existing accounts (read-only -- nothing about them is
// created or mutated, only chat_* rows, fully cleaned up in
// after()). Teacher 19 (same fixture used by chatTeacherSupport.test.js
// -- staff_support isn't course-scoped, so no conflict). Two real
// admins (42 Felipe Segatto, 43 Larissa Almeida) for the reassignment
// test, same as chatAdministrativeSupport.test.js.
const TEACHER_USER_ID = 19;
const ADMIN_A_USER_ID = 42;
const ADMIN_B_USER_ID = 43;

const createdConversationIds = [];

async function openTestTicket(overrides = {}) {
  const result = await openStaffTicket(db, {
    userId: TEACHER_USER_ID,
    category: "course",
    subject: `TEST ETAPA11 subject ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    body: "Preciso de orientação sobre o conteúdo do curso.",
    ...overrides,
  });

  createdConversationIds.push(result.conversationId);

  return result.conversationId;
}

async function openTestAdminConversation(overrides = {}) {
  const result = await openStaffConversation(db, {
    adminUserId: ADMIN_A_USER_ID,
    teacherUserId: TEACHER_USER_ID,
    category: "administrative",
    subject: `TEST ETAPA11 admin-initiated ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    body: "Precisamos alinhar um assunto administrativo com você.",
    ...overrides,
  });

  createdConversationIds.push(result.conversationId);

  return result.conversationId;
}

after(async () => {
  if (createdConversationIds.length > 0) {
    const placeholders = createdConversationIds.map(() => "?").join(",");

    // Every message sent through these fixture conversations now
    // also fires chat.message.received (Etapa 13) -- clean those up
    // too, or real recipient accounts (e.g. shared teacher/admin
    // fixtures reused across chat test files) would accumulate
    // leftover notification rows from automated test runs.
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

test("openStaffTicket (teacher-initiated) creates a waiting_staff ticket with only the teacher as participant", async () => {
  const conversationId = await openTestTicket();

  const [[conversationRow]] = await db
    .promise()
    .query("SELECT type, channel_kind, status, category, assigned_user_id, initiator_role FROM chat_conversations WHERE id = ?", [
      conversationId,
    ]);

  assert.equal(conversationRow.type, "staff_support");
  assert.equal(conversationRow.channel_kind, "ticket");
  assert.equal(conversationRow.status, "waiting_staff");
  assert.equal(conversationRow.category, "course");
  assert.equal(conversationRow.initiator_role, "teacher");
  assert.equal(conversationRow.assigned_user_id, null);

  const [participantRows] = await db
    .promise()
    .query("SELECT user_id, participant_role FROM chat_participants WHERE conversation_id = ?", [conversationId]);

  assert.equal(participantRows.length, 1);
  assert.equal(participantRows[0].user_id, TEACHER_USER_ID);
  assert.equal(participantRows[0].participant_role, "teacher");
});

test("openStaffTicket rejects an invalid category", async () => {
  await assert.rejects(
    () =>
      openStaffTicket(db, {
        userId: TEACHER_USER_ID,
        category: "not_a_real_category",
        subject: "TEST ETAPA11",
        body: "corpo",
      }),
    (error) => error.statusCode === 400
  );
});

test("openStaffConversation (admin-initiated) creates a waiting_teacher conversation with both sides as participants, self-assigned", async () => {
  const conversationId = await openTestAdminConversation();

  const [[conversationRow]] = await db
    .promise()
    .query("SELECT status, assigned_user_id, initiator_role FROM chat_conversations WHERE id = ?", [conversationId]);

  assert.equal(conversationRow.status, "waiting_teacher");
  assert.equal(conversationRow.assigned_user_id, ADMIN_A_USER_ID);
  assert.equal(conversationRow.initiator_role, "admin");

  const [participantRows] = await db
    .promise()
    .query("SELECT user_id, participant_role FROM chat_participants WHERE conversation_id = ? ORDER BY user_id", [
      conversationId,
    ]);

  assert.equal(participantRows.length, 2);

  const roles = participantRows.map((row) => row.participant_role).sort();

  assert.deepEqual(roles, ["admin", "teacher"]);
});

test("openStaffConversation rejects a teacherUserId that isn't an active teacher", async () => {
  await assert.rejects(
    () =>
      openStaffConversation(db, {
        adminUserId: ADMIN_A_USER_ID,
        teacherUserId: 999999999,
        category: "course",
        subject: "TEST ETAPA11",
        body: "corpo",
      }),
    (error) => error.statusCode === 404
  );
});

test("a teacher-opened ticket appears unassigned in the queue, then disappears from unassignedOnly after being claimed", async () => {
  const conversationId = await openTestTicket();

  const beforeClaim = await listStaffQueue(db, { unassignedOnly: true, limit: 50 });

  assert.ok(beforeClaim.items.some((item) => item.conversationId === conversationId));

  await assignStaffTicket(db, { conversationId, adminUserId: ADMIN_A_USER_ID });

  const afterClaim = await listStaffQueue(db, { unassignedOnly: true, limit: 50 });

  assert.equal(
    afterClaim.items.some((item) => item.conversationId === conversationId),
    false
  );

  const assignedToA = await listStaffQueue(db, { assignedToUserId: ADMIN_A_USER_ID, limit: 50 });
  const found = assignedToA.items.find((item) => item.conversationId === conversationId);

  assert.ok(found);
  assert.equal(found.assignedUserId, ADMIN_A_USER_ID);
  assert.equal(found.teacher.userId, TEACHER_USER_ID);
});

test("an admin-initiated conversation is already visible under assignedToUserId without a separate claim", async () => {
  const conversationId = await openTestAdminConversation();

  const assignedToA = await listStaffQueue(db, { assignedToUserId: ADMIN_A_USER_ID, limit: 50 });

  assert.ok(assignedToA.items.some((item) => item.conversationId === conversationId));
});

test("assignStaffTicket adds the admin as a participant and posts a system message", async () => {
  const conversationId = await openTestTicket();

  await assignStaffTicket(db, { conversationId, adminUserId: ADMIN_A_USER_ID });

  const [participantRows] = await db
    .promise()
    .query("SELECT user_id, participant_role FROM chat_participants WHERE conversation_id = ? AND user_id = ?", [
      conversationId,
      ADMIN_A_USER_ID,
    ]);

  assert.equal(participantRows.length, 1);
  assert.equal(participantRows[0].participant_role, "admin");

  const [messageRows] = await db
    .promise()
    .query("SELECT sender_user_id, message_type, body FROM chat_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1", [
      conversationId,
    ]);

  assert.equal(messageRows[0].sender_user_id, null);
  assert.equal(messageRows[0].message_type, "system");
  assert.match(messageRows[0].body, /assumiu o atendimento/);
});

test("reassigning a teacher-opened ticket to a different admin keeps the original admin as a participant", async () => {
  const conversationId = await openTestTicket();

  await assignStaffTicket(db, { conversationId, adminUserId: ADMIN_A_USER_ID });
  await assignStaffTicket(db, { conversationId, adminUserId: ADMIN_B_USER_ID });

  const [[conversationRow]] = await db
    .promise()
    .query("SELECT assigned_user_id FROM chat_conversations WHERE id = ?", [conversationId]);

  assert.equal(conversationRow.assigned_user_id, ADMIN_B_USER_ID);

  const [participantRows] = await db
    .promise()
    .query("SELECT user_id FROM chat_participants WHERE conversation_id = ? AND user_id IN (?, ?)", [
      conversationId,
      ADMIN_A_USER_ID,
      ADMIN_B_USER_ID,
    ]);

  assert.equal(participantRows.length, 2);

  const [[lastMessageRow]] = await db
    .promise()
    .query("SELECT body FROM chat_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1", [conversationId]);

  assert.match(lastMessageRow.body, /reatribuído/);
});

test("assignStaffTicket rejects a conversationId that isn't a staff_support conversation", async () => {
  await assert.rejects(
    () => assignStaffTicket(db, { conversationId: 999999999, adminUserId: ADMIN_A_USER_ID }),
    (error) => error.statusCode === 404
  );
});

test("a message from the teacher keeps waiting_staff, a reply from the admin flips to waiting_teacher", async () => {
  const conversationId = await openTestTicket();

  await assignStaffTicket(db, { conversationId, adminUserId: ADMIN_A_USER_ID });

  await createMessage(db, { conversationId, userId: TEACHER_USER_ID, body: "mais detalhes sobre a dúvida" });

  const [[afterTeacherRow]] = await db
    .promise()
    .query("SELECT status FROM chat_conversations WHERE id = ?", [conversationId]);

  assert.equal(afterTeacherRow.status, "waiting_staff");

  await createMessage(db, { conversationId, userId: ADMIN_A_USER_ID, body: "já esclareci para você" });

  const [[afterAdminRow]] = await db
    .promise()
    .query("SELECT status FROM chat_conversations WHERE id = ?", [conversationId]);

  assert.equal(afterAdminRow.status, "waiting_teacher");
});

test("a teacher message inside the reopen window reopens a resolved ticket", async () => {
  const conversationId = await openTestTicket();

  await resolveConversation(db, { conversationId, userId: TEACHER_USER_ID });

  await createMessage(db, { conversationId, userId: TEACHER_USER_ID, body: "na verdade ainda não resolveu" });

  const [[row]] = await db.promise().query("SELECT status FROM chat_conversations WHERE id = ?", [conversationId]);

  assert.equal(row.status, "waiting_staff");
});

test("a teacher message outside the reopen window is rejected, not silently reopened", async () => {
  const conversationId = await openTestTicket();

  await resolveConversation(db, { conversationId, userId: TEACHER_USER_ID });

  await db
    .promise()
    .query("UPDATE chat_conversations SET resolved_at = DATE_SUB(NOW(), INTERVAL 30 DAY) WHERE id = ?", [
      conversationId,
    ]);

  await assert.rejects(
    () => createMessage(db, { conversationId, userId: TEACHER_USER_ID, body: "tarde demais?" }),
    (error) => error.statusCode === 409
  );

  const [[row]] = await db.promise().query("SELECT status FROM chat_conversations WHERE id = ?", [conversationId]);

  assert.equal(row.status, "resolved");
});

test("an admin can still post a final note on a resolved staff ticket without reopening it", async () => {
  const conversationId = await openTestTicket();

  await assignStaffTicket(db, { conversationId, adminUserId: ADMIN_A_USER_ID });
  await resolveConversation(db, { conversationId, userId: ADMIN_A_USER_ID });

  await createMessage(db, { conversationId, userId: ADMIN_A_USER_ID, body: "nota final, sem reabrir" });

  const [[row]] = await db.promise().query("SELECT status FROM chat_conversations WHERE id = ?", [conversationId]);

  assert.equal(row.status, "resolved");
});
