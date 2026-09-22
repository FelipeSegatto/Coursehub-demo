const { test, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");
require("../../services/notifications/eventDefinitions"); // registers chat.message.received
const { openAcademicPeerConversation } = require("../../services/chat/chatAcademicPeerService");
const { openAdministrativeTicket } = require("../../services/chat/chatAdministrativeSupportService");
const { createMessage } = require("../../services/chat/chatMessageService");

// Real, pre-existing data (read-only -- no course/enrollment row is
// created or mutated, only chat_*/notifications* rows, fully cleaned
// up in after()). Students 4/5 (Ana Beatriz Sousa, João Victor) share
// course 8, kept disjoint from every other chat/notification test
// file's own fixture ids per this project's convention (node:test
// runs files in parallel by default -- see notificationService.test.js's
// own comment on this). Student 83 is the chatAdministrativeSupport.test.js
// fixture, reused read-only here too -- administrative_support tickets
// are never deduplicated by conversation_key (each open call creates
// a brand new row), so reusing that student id carries no collision
// risk regardless of concurrency.
const STUDENT_A_USER_ID = 4;
const STUDENT_B_USER_ID = 5;
const STUDENT_C_USER_ID = 83;

const createdConversationIds = [];
const createdNotificationIds = [];

after(async () => {
  if (createdNotificationIds.length > 0) {
    const notificationPlaceholders = createdNotificationIds.map(() => "?").join(",");

    await retryOnDeadlock(() =>
      db
        .promise()
        .query(
          `DELETE FROM notification_deliveries WHERE recipient_id IN (SELECT id FROM notification_recipients WHERE notification_id IN (${notificationPlaceholders}))`,
          createdNotificationIds
        )
    );

    await retryOnDeadlock(() =>
      db
        .promise()
        .query(`DELETE FROM notification_recipients WHERE notification_id IN (${notificationPlaceholders})`, createdNotificationIds)
    );

    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM notifications WHERE id IN (${notificationPlaceholders})`, createdNotificationIds)
    );
  }

  await db.promise().query(`DELETE FROM notification_preferences WHERE category = 'chat' AND user_id = ?`, [
    STUDENT_B_USER_ID,
  ]);

  if (createdConversationIds.length > 0) {
    const placeholders = createdConversationIds.map(() => "?").join(",");

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

async function findNotificationByMessageId(messageId) {
  const [rows] = await db
    .promise()
    .query(`SELECT * FROM notifications WHERE deduplication_key = ?`, [`chat.message.received:${messageId}`]);

  return rows[0] || null;
}

test("sending a message notifies the other participant, not the sender", async () => {
  const { conversationId } = await openAcademicPeerConversation(db, {
    userId: STUDENT_A_USER_ID,
    peerUserId: STUDENT_B_USER_ID,
  });

  createdConversationIds.push(conversationId);

  const message = await createMessage(db, {
    conversationId,
    userId: STUDENT_A_USER_ID,
    body: "Oi, tudo bem? Preciso de ajuda com a atividade.",
  });

  const notification = await findNotificationByMessageId(message.messageId);

  assert.ok(notification);
  createdNotificationIds.push(notification.id);

  assert.equal(notification.category, "chat");
  assert.equal(notification.actor_user_id, STUDENT_A_USER_ID);
  assert.match(notification.title, /Ana Beatriz Sousa/);
  assert.equal(notification.message, "Oi, tudo bem? Preciso de ajuda com a atividade.");

  const [recipientRows] = await db
    .promise()
    .query(`SELECT user_id, action_path FROM notification_recipients WHERE notification_id = ?`, [notification.id]);

  assert.equal(recipientRows.length, 1);
  assert.equal(recipientRows[0].user_id, STUDENT_B_USER_ID);
  assert.equal(recipientRows[0].action_path, "/aluno/chat");
});

test("a long message body is truncated in the notification preview", async () => {
  const { conversationId } = await openAcademicPeerConversation(db, {
    userId: STUDENT_A_USER_ID,
    peerUserId: STUDENT_B_USER_ID,
  });

  createdConversationIds.push(conversationId);

  const longBody = "x".repeat(300);

  const message = await createMessage(db, { conversationId, userId: STUDENT_A_USER_ID, body: longBody });

  const notification = await findNotificationByMessageId(message.messageId);

  assert.ok(notification);
  createdNotificationIds.push(notification.id);

  assert.equal(notification.message.length, 143); // 140 chars + "..."
  assert.ok(notification.message.endsWith("..."));
});

test("email delivery is skipped by default (default_off), but sent once the recipient opts in", async () => {
  const { conversationId } = await openAcademicPeerConversation(db, {
    userId: STUDENT_A_USER_ID,
    peerUserId: STUDENT_B_USER_ID,
  });

  createdConversationIds.push(conversationId);

  const firstMessage = await createMessage(db, { conversationId, userId: STUDENT_A_USER_ID, body: "mensagem 1" });
  const firstNotification = await findNotificationByMessageId(firstMessage.messageId);

  createdNotificationIds.push(firstNotification.id);

  const [firstRecipientRows] = await db
    .promise()
    .query(`SELECT id FROM notification_recipients WHERE notification_id = ?`, [firstNotification.id]);

  const [firstDeliveryRows] = await db
    .promise()
    .query(`SELECT status FROM notification_deliveries WHERE recipient_id = ?`, [firstRecipientRows[0].id]);

  assert.equal(firstDeliveryRows[0].status, "skipped");

  await db
    .promise()
    .query(`INSERT INTO notification_preferences (user_id, category, email_enabled) VALUES (?, 'chat', 1)`, [
      STUDENT_B_USER_ID,
    ]);

  const secondMessage = await createMessage(db, { conversationId, userId: STUDENT_A_USER_ID, body: "mensagem 2" });
  const secondNotification = await findNotificationByMessageId(secondMessage.messageId);

  createdNotificationIds.push(secondNotification.id);

  const [secondRecipientRows] = await db
    .promise()
    .query(`SELECT id FROM notification_recipients WHERE notification_id = ?`, [secondNotification.id]);

  const [secondDeliveryRows] = await db
    .promise()
    .query(`SELECT status FROM notification_deliveries WHERE recipient_id = ?`, [secondRecipientRows[0].id]);

  assert.equal(secondDeliveryRows[0].status, "pending");
});

test("a message in a still-unassigned ticket with no other participant does not error and creates no notification", async () => {
  const { conversationId } = await openAdministrativeTicket(db, {
    userId: STUDENT_C_USER_ID,
    category: "financial",
    subject: `TEST ETAPA13 subject ${Date.now()}`,
    body: "Preciso de ajuda com minha fatura.",
  });

  createdConversationIds.push(conversationId);

  const message = await createMessage(db, {
    conversationId,
    userId: STUDENT_C_USER_ID,
    body: "alguém pode me ajudar?",
  });

  const notification = await findNotificationByMessageId(message.messageId);

  assert.equal(notification, null);
});

test("resending the same clientMessageId does not create a second notification", async () => {
  const { conversationId } = await openAcademicPeerConversation(db, {
    userId: STUDENT_A_USER_ID,
    peerUserId: STUDENT_B_USER_ID,
  });

  createdConversationIds.push(conversationId);

  const clientMessageId = `test-etapa13-${Date.now()}`;

  const first = await createMessage(db, {
    conversationId,
    userId: STUDENT_A_USER_ID,
    body: "mensagem idempotente",
    clientMessageId,
  });

  const second = await createMessage(db, {
    conversationId,
    userId: STUDENT_A_USER_ID,
    body: "mensagem idempotente",
    clientMessageId,
  });

  assert.equal(first.messageId, second.messageId);

  const notification = await findNotificationByMessageId(first.messageId);

  assert.ok(notification);
  createdNotificationIds.push(notification.id);

  const [countRows] = await db
    .promise()
    .query(`SELECT COUNT(*) AS total FROM notifications WHERE deduplication_key = ?`, [
      `chat.message.received:${first.messageId}`,
    ]);

  assert.equal(countRows[0].total, 1);
});
