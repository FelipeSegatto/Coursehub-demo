const { test, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");
require("../../services/notifications/eventDefinitions"); // registers chat.message.received
const {
  openAdministrativeTicket,
  listAdministrativeQueue,
  assignAdministrativeTicket,
} = require("../../services/chat/chatAdministrativeSupportService");
const { resolveConversation } = require("../../services/chat/chatConversationService");
const { createMessage } = require("../../services/chat/chatMessageService");

// Real, pre-existing accounts (read-only -- nothing about them is
// created or mutated, only chat_* rows, fully cleaned up in
// after()). Two real admins (42 Felipe Segatto, 43 Larissa Almeida)
// for the reassignment test; student 83 (Victor Tobita) needs no
// enrollment for this modality (administrative_support isn't
// course-scoped).
const STUDENT_USER_ID = 83;
const ADMIN_A_USER_ID = 42;
const ADMIN_B_USER_ID = 43;

const createdConversationIds = [];

async function openTestTicket(overrides = {}) {
  const result = await openAdministrativeTicket(db, {
    userId: STUDENT_USER_ID,
    category: "financial",
    subject: `TEST ETAPA10 subject ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    body: "Preciso de ajuda com minha fatura.",
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
    // too, or real recipient accounts (e.g. shared admin fixtures
    // reused across chat test files) would accumulate leftover
    // notification rows from automated test runs.
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

test("openAdministrativeTicket creates a waiting_staff ticket with only the student as participant", async () => {
  const conversationId = await openTestTicket();

  const [[conversationRow]] = await db
    .promise()
    .query("SELECT type, channel_kind, status, category, assigned_user_id FROM chat_conversations WHERE id = ?", [
      conversationId,
    ]);

  assert.equal(conversationRow.type, "administrative_support");
  assert.equal(conversationRow.channel_kind, "ticket");
  assert.equal(conversationRow.status, "waiting_staff");
  assert.equal(conversationRow.category, "financial");
  assert.equal(conversationRow.assigned_user_id, null);

  const [participantRows] = await db
    .promise()
    .query("SELECT user_id, participant_role FROM chat_participants WHERE conversation_id = ?", [conversationId]);

  assert.equal(participantRows.length, 1);
  assert.equal(participantRows[0].user_id, STUDENT_USER_ID);
  assert.equal(participantRows[0].participant_role, "student");
});

test("openAdministrativeTicket rejects an invalid category", async () => {
  await assert.rejects(
    () =>
      openAdministrativeTicket(db, {
        userId: STUDENT_USER_ID,
        category: "not_a_real_category",
        subject: "TEST ETAPA10",
        body: "corpo",
      }),
    (error) => error.statusCode === 400
  );
});

test("openAdministrativeTicket rejects a missing subject or empty body", async () => {
  await assert.rejects(
    () =>
      openAdministrativeTicket(db, {
        userId: STUDENT_USER_ID,
        category: "request",
        subject: "  ",
        body: "corpo",
      }),
    (error) => error.statusCode === 400
  );

  await assert.rejects(
    () =>
      openAdministrativeTicket(db, {
        userId: STUDENT_USER_ID,
        category: "request",
        subject: "TEST ETAPA10",
        body: "   ",
      }),
    (error) => error.statusCode === 400
  );
});

test("the ticket appears unassigned in the queue, then disappears from unassignedOnly after being claimed", async () => {
  const conversationId = await openTestTicket();

  const beforeClaim = await listAdministrativeQueue(db, { unassignedOnly: true, limit: 50 });

  assert.ok(beforeClaim.items.some((item) => item.conversationId === conversationId));

  await assignAdministrativeTicket(db, { conversationId, adminUserId: ADMIN_A_USER_ID });

  const afterClaim = await listAdministrativeQueue(db, { unassignedOnly: true, limit: 50 });

  assert.equal(
    afterClaim.items.some((item) => item.conversationId === conversationId),
    false
  );

  const assignedToA = await listAdministrativeQueue(db, {
    assignedToUserId: ADMIN_A_USER_ID,
    limit: 50,
  });

  const found = assignedToA.items.find((item) => item.conversationId === conversationId);

  assert.ok(found);
  assert.equal(found.assignedUserId, ADMIN_A_USER_ID);
  assert.equal(found.student.userId, STUDENT_USER_ID);
});

test("assignAdministrativeTicket adds the admin as a participant and posts a system message", async () => {
  const conversationId = await openTestTicket();

  await assignAdministrativeTicket(db, { conversationId, adminUserId: ADMIN_A_USER_ID });

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

test("reassigning to a different admin keeps the original admin as a participant", async () => {
  const conversationId = await openTestTicket();

  await assignAdministrativeTicket(db, { conversationId, adminUserId: ADMIN_A_USER_ID });
  await assignAdministrativeTicket(db, { conversationId, adminUserId: ADMIN_B_USER_ID });

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

test("assignAdministrativeTicket rejects a conversationId that isn't an administrative_support ticket", async () => {
  await assert.rejects(
    () => assignAdministrativeTicket(db, { conversationId: 999999999, adminUserId: ADMIN_A_USER_ID }),
    (error) => error.statusCode === 404
  );
});

test("a message from the student keeps waiting_staff, a reply from the admin flips to waiting_student", async () => {
  const conversationId = await openTestTicket();

  await assignAdministrativeTicket(db, { conversationId, adminUserId: ADMIN_A_USER_ID });

  await createMessage(db, { conversationId, userId: STUDENT_USER_ID, body: "mais detalhes sobre o problema" });

  const [[afterStudentRow]] = await db
    .promise()
    .query("SELECT status FROM chat_conversations WHERE id = ?", [conversationId]);

  assert.equal(afterStudentRow.status, "waiting_staff");

  await createMessage(db, { conversationId, userId: ADMIN_A_USER_ID, body: "já resolvi para você" });

  const [[afterAdminRow]] = await db
    .promise()
    .query("SELECT status FROM chat_conversations WHERE id = ?", [conversationId]);

  assert.equal(afterAdminRow.status, "waiting_student");
});

test("a student message inside the reopen window reopens a resolved ticket", async () => {
  const conversationId = await openTestTicket();

  await resolveConversation(db, { conversationId, userId: STUDENT_USER_ID });

  await createMessage(db, { conversationId, userId: STUDENT_USER_ID, body: "na verdade ainda não resolveu" });

  const [[row]] = await db.promise().query("SELECT status FROM chat_conversations WHERE id = ?", [conversationId]);

  assert.equal(row.status, "waiting_staff");
});

test("a student message outside the reopen window is rejected, not silently reopened", async () => {
  const conversationId = await openTestTicket();

  await resolveConversation(db, { conversationId, userId: STUDENT_USER_ID });

  // Simulate the resolution having happened long ago -- direct SQL,
  // since resolveConversation itself always sets resolved_at = NOW().
  await db
    .promise()
    .query("UPDATE chat_conversations SET resolved_at = DATE_SUB(NOW(), INTERVAL 30 DAY) WHERE id = ?", [
      conversationId,
    ]);

  await assert.rejects(
    () => createMessage(db, { conversationId, userId: STUDENT_USER_ID, body: "tarde demais?" }),
    (error) => error.statusCode === 409
  );

  const [[row]] = await db.promise().query("SELECT status FROM chat_conversations WHERE id = ?", [conversationId]);

  assert.equal(row.status, "resolved");
});

test("an admin can still post a final note on a resolved ticket without reopening it", async () => {
  const conversationId = await openTestTicket();

  await assignAdministrativeTicket(db, { conversationId, adminUserId: ADMIN_A_USER_ID });
  await resolveConversation(db, { conversationId, userId: ADMIN_A_USER_ID });

  await createMessage(db, { conversationId, userId: ADMIN_A_USER_ID, body: "nota final, sem reabrir" });

  const [[row]] = await db.promise().query("SELECT status FROM chat_conversations WHERE id = ?", [conversationId]);

  assert.equal(row.status, "resolved");
});

// -----------------------------------------------------------------
// Notificações administrativas (evolução do sistema de notificações,
// seção 8/19 do spec): um requerimento precisa avisar TODOS os admins
// ativos mesmo sem nenhum atribuído -- chat_participants ainda não tem
// nenhum admin nesse momento, então isso não pode depender de
// resolveOtherActiveParticipants.
// -----------------------------------------------------------------

async function getNotificationForConversation(conversationId, type) {
  const [rows] = await db
    .promise()
    .query(
      `SELECT id, category, actor_user_id FROM notifications WHERE source_type = 'chat_conversation' AND source_id = ? AND type = ? LIMIT 1`,
      [conversationId, type]
    );

  return rows[0] || null;
}

test("administrative.request.created: admin A e admin B recebem, aluno não recebe a própria notificação, ticket segue sem atribuição", async () => {
  const conversationId = await openTestTicket({ subject: "TEST ETAPA10 sem admin atribuído" });

  const notification = await getNotificationForConversation(conversationId, "administrative.request.created");

  assert.ok(notification, "administrative.request.created deveria ter sido criada");
  assert.equal(notification.category, "request");
  assert.equal(notification.actor_user_id, STUDENT_USER_ID);

  const [recipientRows] = await db
    .promise()
    .query(`SELECT user_id FROM notification_recipients WHERE notification_id = ?`, [notification.id]);

  const recipientUserIds = recipientRows.map((row) => row.user_id);

  assert.ok(recipientUserIds.includes(ADMIN_A_USER_ID), "admin A deveria estar entre os destinatários");
  assert.ok(recipientUserIds.includes(ADMIN_B_USER_ID), "admin B deveria estar entre os destinatários");
  assert.equal(
    recipientUserIds.includes(STUDENT_USER_ID),
    false,
    "o próprio aluno que abriu o requerimento não deveria se notificar"
  );

  const [[conversationRow]] = await db
    .promise()
    .query("SELECT status, assigned_user_id FROM chat_conversations WHERE id = ?", [conversationId]);

  assert.equal(conversationRow.assigned_user_id, null, "criar a notificação não deveria atribuir o ticket a ninguém");
  assert.equal(conversationRow.status, "waiting_staff");
});

test("administrative.request.created não duplica em uma segunda leitura/reprocessamento (mesma conversationId)", async () => {
  const conversationId = await openTestTicket();

  const notification = await getNotificationForConversation(conversationId, "administrative.request.created");

  // O evento só é disparado uma vez dentro de openAdministrativeTicket
  // (não há reprocessamento real deste ponto), mas a garantia de
  // dedup do próprio createNotificationEvent (UNIQUE KEY em
  // deduplication_key) é o que impediria uma duplicata caso este
  // ponto fosse chamado de novo -- confirmamos aqui que existe
  // exatamente UMA notificação para esta conversationId.
  const [rows] = await db
    .promise()
    .query(
      `SELECT COUNT(*) AS total FROM notifications WHERE source_type = 'chat_conversation' AND source_id = ? AND type = 'administrative.request.created'`,
      [conversationId]
    );

  assert.equal(Number(rows[0].total), 1);
  assert.ok(notification);
});

test("mensagens em administrative_support geram administrative.request.message_received (category=request), nunca chat.message.received", async () => {
  const conversationId = await openTestTicket();

  await assignAdministrativeTicket(db, { conversationId, adminUserId: ADMIN_A_USER_ID });

  const sentMessage = await createMessage(db, {
    conversationId,
    userId: STUDENT_USER_ID,
    body: "mensagem de teste para checar o tipo de notificação",
  });

  const [[requestNotification]] = await db
    .promise()
    .query(
      `SELECT id, category FROM notifications WHERE source_type = 'chat_conversation' AND source_id = ? AND type = 'administrative.request.message_received' ORDER BY id DESC LIMIT 1`,
      [conversationId]
    );

  assert.ok(requestNotification, "administrative.request.message_received deveria ter sido criada");
  assert.equal(requestNotification.category, "request");

  const [chatNotificationRows] = await db
    .promise()
    .query(
      `SELECT id FROM notifications WHERE source_type = 'chat_conversation' AND source_id = ? AND type = 'chat.message.received'`,
      [conversationId]
    );

  assert.equal(chatNotificationRows.length, 0, "chat.message.received não deveria disparar para administrative_support");

  const [recipientRows] = await db
    .promise()
    .query(`SELECT user_id FROM notification_recipients WHERE notification_id = ?`, [requestNotification.id]);

  assert.deepEqual(
    recipientRows.map((row) => row.user_id),
    [ADMIN_A_USER_ID],
    "só o admin atribuído (o outro participante) deveria receber a mensagem do aluno"
  );

  assert.equal(sentMessage.body, "mensagem de teste para checar o tipo de notificação");
});
