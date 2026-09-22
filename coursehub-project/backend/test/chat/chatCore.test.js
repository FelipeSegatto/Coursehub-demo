const { test, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");
require("../../services/notifications/eventDefinitions"); // registers chat.message.received
const {
  createConversation,
  getConversationForUser,
  listConversationsForUser,
  getUnreadConversationCount,
} = require("../../services/chat/chatConversationService");
const {
  markConversationRead,
  archiveConversationForUser,
  listParticipants,
} = require("../../services/chat/chatParticipantService");
const { createMessage, listMessages } = require("../../services/chat/chatMessageService");

// Chat fixture: 4 real active users (22-25), chosen outside every
// offset range already claimed by the notification test files (see
// the convention documented across that suite) -- chat conversations
// aren't scoped to a course/class fixture the way academic
// notifications are, so any real distinct active users work here.
const USER_A_ID = 22;
const USER_B_ID = 23;
const USER_C_ID = 24; // never a participant -- used for isolation tests
const USER_D_ID = 25;

const createdConversationIds = [];

async function createTestConversation(overrides = {}) {
  const { conversationId } = await createConversation(db, {
    type: "academic_peer",
    channelKind: "direct",
    createdByUserId: USER_A_ID,
    initiatorRole: "student",
    conversationKey: `test:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    participants: [
      { userId: USER_A_ID, participantRole: "student" },
      { userId: USER_B_ID, participantRole: "student" },
    ],
    ...overrides,
  });

  createdConversationIds.push(conversationId);

  return conversationId;
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

    // Break the circular last_message_id FK first, same reasoning as
    // the migration's own rollback: chat_conversations.last_message_id
    // references chat_messages, which is a child of chat_conversations
    // by conversation_id -- can't drop rows on either side while the
    // other still points at them.
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

test("a non-participant gets 404 on every read/write, not the conversation's data", async () => {
  const conversationId = await createTestConversation();

  await assert.rejects(
    () => getConversationForUser(db, { conversationId, userId: USER_C_ID }),
    (error) => error.statusCode === 404
  );

  await assert.rejects(
    () => listMessages(db, { conversationId, userId: USER_C_ID, limit: 10 }),
    (error) => error.statusCode === 404
  );

  await assert.rejects(
    () => createMessage(db, { conversationId, userId: USER_C_ID, body: "hello" }),
    (error) => error.statusCode === 404
  );

  await assert.rejects(
    () => markConversationRead(db, { conversationId, userId: USER_C_ID }),
    (error) => error.statusCode === 404
  );

  await assert.rejects(
    () => archiveConversationForUser(db, { conversationId, userId: USER_C_ID }),
    (error) => error.statusCode === 404
  );
});

test("an unknown conversationId 404s the same way a real-but-foreign one does", async () => {
  await assert.rejects(
    () => getConversationForUser(db, { conversationId: 999999999, userId: USER_A_ID }),
    (error) => error.statusCode === 404
  );
});

test("createMessage is atomic: the conversation's last_message_id/last_message_at match the new message", async () => {
  const conversationId = await createTestConversation();

  const message = await createMessage(db, {
    conversationId,
    userId: USER_A_ID,
    body: "oi, tudo bem?",
  });

  const conversation = await getConversationForUser(db, { conversationId, userId: USER_A_ID });

  assert.equal(conversation.lastMessageId, message.messageId);
  assert.ok(conversation.lastMessageAt);
});

test("a repeated send with the same clientMessageId from the same sender is idempotent", async () => {
  const conversationId = await createTestConversation();

  const first = await createMessage(db, {
    conversationId,
    userId: USER_A_ID,
    body: "primeira tentativa",
    clientMessageId: "client-abc-123",
  });

  const second = await createMessage(db, {
    conversationId,
    userId: USER_A_ID,
    body: "primeira tentativa (reenvio otimista)",
    clientMessageId: "client-abc-123",
  });

  assert.equal(first.messageId, second.messageId);
  assert.equal(second.body, "primeira tentativa");

  const { items } = await listMessages(db, { conversationId, userId: USER_A_ID, limit: 50 });

  assert.equal(items.length, 1);
});

test("the same clientMessageId from a different sender is a separate message", async () => {
  const conversationId = await createTestConversation();

  const fromA = await createMessage(db, {
    conversationId,
    userId: USER_A_ID,
    body: "mensagem do A",
    clientMessageId: "shared-client-id",
  });

  const fromB = await createMessage(db, {
    conversationId,
    userId: USER_B_ID,
    body: "mensagem do B",
    clientMessageId: "shared-client-id",
  });

  assert.notEqual(fromA.messageId, fromB.messageId);
});

test("a participant with can_post=false cannot send, but can still read", async () => {
  const conversationId = await createTestConversation({
    participants: [
      { userId: USER_A_ID, participantRole: "student" },
      { userId: USER_B_ID, participantRole: "student", canPost: false },
    ],
  });

  await createMessage(db, { conversationId, userId: USER_A_ID, body: "oi" });

  await assert.rejects(
    () => createMessage(db, { conversationId, userId: USER_B_ID, body: "não deveria conseguir" }),
    (error) => error.statusCode === 403
  );

  const { items } = await listMessages(db, { conversationId, userId: USER_B_ID, limit: 10 });

  assert.equal(items.length, 1);
});

test("empty and oversized message bodies are rejected", async () => {
  const conversationId = await createTestConversation();

  await assert.rejects(
    () => createMessage(db, { conversationId, userId: USER_A_ID, body: "   " }),
    (error) => error.statusCode === 400
  );

  await assert.rejects(
    () => createMessage(db, { conversationId, userId: USER_A_ID, body: "x".repeat(4001) }),
    (error) => error.statusCode === 400
  );
});

test("replyToMessageId must belong to the same conversation", async () => {
  const conversationId = await createTestConversation();
  const otherConversationId = await createTestConversation();

  const messageInOther = await createMessage(db, {
    conversationId: otherConversationId,
    userId: USER_A_ID,
    body: "mensagem em outra conversa",
  });

  await assert.rejects(
    () =>
      createMessage(db, {
        conversationId,
        userId: USER_A_ID,
        body: "resposta inválida",
        replyToMessageId: messageInOther.messageId,
      }),
    (error) => error.statusCode === 400
  );
});

test("listMessages paginates by cursor, most recent first, never skipping or duplicating", async () => {
  const conversationId = await createTestConversation();

  const sentIds = [];

  for (let i = 1; i <= 5; i += 1) {
    const message = await createMessage(db, { conversationId, userId: USER_A_ID, body: `mensagem ${i}` });
    sentIds.push(message.messageId);
  }

  const firstPage = await listMessages(db, { conversationId, userId: USER_A_ID, limit: 2 });
  assert.equal(firstPage.items.length, 2);
  assert.deepEqual(
    firstPage.items.map((item) => item.messageId),
    [sentIds[4], sentIds[3]]
  );
  assert.ok(firstPage.nextCursor);

  const secondPage = await listMessages(db, {
    conversationId,
    userId: USER_A_ID,
    limit: 2,
    cursor: firstPage.nextCursor,
  });
  assert.deepEqual(
    secondPage.items.map((item) => item.messageId),
    [sentIds[2], sentIds[1]]
  );

  const thirdPage = await listMessages(db, {
    conversationId,
    userId: USER_A_ID,
    limit: 2,
    cursor: secondPage.nextCursor,
  });
  assert.deepEqual(
    thirdPage.items.map((item) => item.messageId),
    [sentIds[0]]
  );
  assert.equal(thirdPage.nextCursor, null);
});

test("markConversationRead with no explicit id marks read up to the conversation's latest message", async () => {
  const conversationId = await createTestConversation();

  await createMessage(db, { conversationId, userId: USER_A_ID, body: "mensagem 1" });
  const last = await createMessage(db, { conversationId, userId: USER_A_ID, body: "mensagem 2" });

  await markConversationRead(db, { conversationId, userId: USER_B_ID });

  const unreadBefore = await getUnreadConversationCount(db, { userId: USER_B_ID });

  const participants = await listParticipants(db.promise(), { conversationId });
  const participantB = participants.find((p) => p.userId === USER_B_ID);

  assert.equal(participantB.participantId > 0, true);

  const [[row]] = await db
    .promise()
    .query("SELECT last_read_message_id FROM chat_participants WHERE conversation_id = ? AND user_id = ?", [
      conversationId,
      USER_B_ID,
    ]);

  assert.equal(row.last_read_message_id, last.messageId);
  assert.ok(unreadBefore.unreadCount >= 0);
});

test("getUnreadConversationCount reflects unseen activity and drops after marking read", async () => {
  const conversationId = await createTestConversation();

  await createMessage(db, { conversationId, userId: USER_A_ID, body: "novidade" });

  const beforeRead = await getUnreadConversationCount(db, { userId: USER_B_ID });
  assert.ok(beforeRead.unreadCount >= 1);

  await markConversationRead(db, { conversationId, userId: USER_B_ID });

  const [rows] = await db.promise().query(
    `
      SELECT cc.id
      FROM chat_conversations cc
      INNER JOIN chat_participants cp ON cp.conversation_id = cc.id
      WHERE cp.user_id = ? AND cc.id = ?
        AND cp.left_at IS NULL AND cp.archived_at IS NULL
        AND cc.last_message_id IS NOT NULL
        AND (cp.last_read_message_id IS NULL OR cp.last_read_message_id < cc.last_message_id)
    `,
    [USER_B_ID, conversationId]
  );

  assert.equal(rows.length, 0);
});

test("archiveConversationForUser hides the conversation from the default list but not the other participant's", async () => {
  const conversationId = await createTestConversation();

  await archiveConversationForUser(db, { conversationId, userId: USER_A_ID });

  const { items: forA } = await listConversationsForUser(db, { userId: USER_A_ID, limit: 50 });
  const { items: forB } = await listConversationsForUser(db, { userId: USER_B_ID, limit: 50 });

  assert.equal(
    forA.some((item) => item.conversationId === conversationId),
    false
  );
  assert.equal(
    forB.some((item) => item.conversationId === conversationId),
    true
  );
});

test("listConversationsForUser paginates by cursor, most recently created first", async () => {
  const first = await createTestConversation();
  const second = await createTestConversation();
  const third = await createTestConversation();

  const page1 = await listConversationsForUser(db, { userId: USER_A_ID, limit: 2 });
  const relevant1 = page1.items.filter((item) => [first, second, third].includes(item.conversationId));

  assert.deepEqual(
    relevant1.map((item) => item.conversationId),
    [third, second]
  );

  const page2 = await listConversationsForUser(db, {
    userId: USER_A_ID,
    limit: 50,
    cursor: page1.nextCursor,
  });
  const relevant2 = page2.items.filter((item) => item.conversationId === first);

  assert.equal(relevant2.length, 1);
});

test("createConversation with a duplicate conversationKey fails instead of silently creating a second conversation", async () => {
  const sharedKey = `test:dup:${Date.now()}`;

  await createConversation(db, {
    type: "academic_peer",
    channelKind: "direct",
    createdByUserId: USER_A_ID,
    initiatorRole: "student",
    conversationKey: sharedKey,
    participants: [
      { userId: USER_A_ID, participantRole: "student" },
      { userId: USER_D_ID, participantRole: "student" },
    ],
  }).then(({ conversationId }) => createdConversationIds.push(conversationId));

  await assert.rejects(
    () =>
      createConversation(db, {
        type: "academic_peer",
        channelKind: "direct",
        createdByUserId: USER_D_ID,
        initiatorRole: "student",
        conversationKey: sharedKey,
        participants: [
          { userId: USER_A_ID, participantRole: "student" },
          { userId: USER_D_ID, participantRole: "student" },
        ],
      }),
    (error) => error.statusCode === 409
  );
});
