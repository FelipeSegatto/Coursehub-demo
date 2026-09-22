const { test, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");
require("../../services/notifications/eventDefinitions"); // registers chat.message.received
const { openTeacherQuestion } = require("../../services/chat/chatTeacherSupportService");
const { resolveConversation, listConversationsForUser } = require("../../services/chat/chatConversationService");
const { createMessage, computeNextConversationStatus } = require("../../services/chat/chatMessageService");

// Real, pre-existing data (read-only -- no enrollment/course row is
// created or mutated, only chat_* rows, fully cleaned up in after()).
// Teacher 9 (user 19) teaches course 9; student 49 (user 69) has an
// active enrollment there (class 18); user 31 has none.
const TEACHER_USER_ID = 19;
const TEACHER_ID = 9; // teachers.id for TEACHER_USER_ID -- openTeacherQuestion now requires an explicit teacherId (multi-teacher courses can't auto-resolve "the" responsible teacher).
const COURSE_ID = 9;
const ENROLLED_STUDENT_USER_ID = 69;
const NOT_ENROLLED_STUDENT_USER_ID = 31;

const createdConversationIds = [];

async function openTestQuestion(overrides = {}) {
  const result = await openTeacherQuestion(db, {
    userId: ENROLLED_STUDENT_USER_ID,
    courseId: COURSE_ID,
    teacherId: TEACHER_ID,
    topic: "content",
    subject: `TEST ETAPA9 subject ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    body: "Não entendi o conteúdo da aula passada.",
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
    // too, or real recipient accounts (e.g. the shared teacher
    // fixture reused across chat test files) would accumulate
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

test("computeNextConversationStatus: teacher_support flips between waiting_staff and waiting_student", () => {
  assert.equal(computeNextConversationStatus("teacher_support", "student", "open"), "waiting_staff");
  assert.equal(computeNextConversationStatus("teacher_support", "teacher", "waiting_staff"), "waiting_student");
  assert.equal(computeNextConversationStatus("teacher_support", "student", "waiting_student"), "waiting_staff");
});

test("computeNextConversationStatus never reopens a resolved or closed conversation", () => {
  assert.equal(computeNextConversationStatus("teacher_support", "teacher", "resolved"), null);
  assert.equal(computeNextConversationStatus("teacher_support", "student", "closed"), null);
});

test("computeNextConversationStatus is a no-op for academic_peer (not a ticket modality)", () => {
  assert.equal(computeNextConversationStatus("academic_peer", "student", "open"), null);
});

test("openTeacherQuestion creates a waiting_staff ticket with the opening message and both participants", async () => {
  const conversationId = await openTestQuestion();

  const [[conversationRow]] = await db
    .promise()
    .query("SELECT type, channel_kind, status, category, course_id FROM chat_conversations WHERE id = ?", [
      conversationId,
    ]);

  assert.equal(conversationRow.type, "teacher_support");
  assert.equal(conversationRow.channel_kind, "ticket");
  assert.equal(conversationRow.status, "waiting_staff");
  assert.equal(conversationRow.category, "content");
  assert.equal(conversationRow.course_id, COURSE_ID);

  const [participantRows] = await db
    .promise()
    .query("SELECT user_id, participant_role FROM chat_participants WHERE conversation_id = ? ORDER BY user_id", [
      conversationId,
    ]);

  const byUserId = Object.fromEntries(participantRows.map((row) => [row.user_id, row.participant_role]));

  assert.equal(byUserId[ENROLLED_STUDENT_USER_ID], "student");
  assert.equal(byUserId[TEACHER_USER_ID], "teacher");

  const [[messageCountRow]] = await db
    .promise()
    .query("SELECT COUNT(*) AS c FROM chat_messages WHERE conversation_id = ?", [conversationId]);

  assert.equal(Number(messageCountRow.c), 1);
});

test("openTeacherQuestion rejects a student without an active enrollment in the course", async () => {
  await assert.rejects(
    () =>
      openTeacherQuestion(db, {
        userId: NOT_ENROLLED_STUDENT_USER_ID,
        courseId: COURSE_ID,
        teacherId: TEACHER_ID,
        topic: "content",
        subject: "TEST ETAPA9 should fail",
        body: "Não deveria conseguir abrir.",
      }),
    (error) => error.statusCode === 403
  );
});

test("openTeacherQuestion rejects a missing/invalid teacherId", async () => {
  await assert.rejects(
    () =>
      openTeacherQuestion(db, {
        userId: ENROLLED_STUDENT_USER_ID,
        courseId: COURSE_ID,
        topic: "content",
        subject: "TEST ETAPA9 sem teacherId",
        body: "corpo",
      }),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    }
  );
});

test("openTeacherQuestion rejects an invalid topic", async () => {
  await assert.rejects(
    () =>
      openTeacherQuestion(db, {
        userId: ENROLLED_STUDENT_USER_ID,
        courseId: COURSE_ID,
        teacherId: TEACHER_ID,
        topic: "not_a_real_topic",
        subject: "TEST ETAPA9",
        body: "corpo",
      }),
    (error) => error.statusCode === 400
  );
});

test("openTeacherQuestion rejects a missing subject or empty body", async () => {
  await assert.rejects(
    () =>
      openTeacherQuestion(db, {
        userId: ENROLLED_STUDENT_USER_ID,
        courseId: COURSE_ID,
        teacherId: TEACHER_ID,
        topic: "general",
        subject: "   ",
        body: "corpo",
      }),
    (error) => error.statusCode === 400
  );

  await assert.rejects(
    () =>
      openTeacherQuestion(db, {
        userId: ENROLLED_STUDENT_USER_ID,
        courseId: COURSE_ID,
        teacherId: TEACHER_ID,
        topic: "general",
        subject: "TEST ETAPA9",
        body: "   ",
      }),
    (error) => error.statusCode === 400
  );
});

test("a message from the student keeps waiting_staff, a reply from the teacher flips to waiting_student", async () => {
  const conversationId = await openTestQuestion();

  await createMessage(db, {
    conversationId,
    userId: ENROLLED_STUDENT_USER_ID,
    body: "mais uma dúvida, ainda sobre o mesmo tópico",
  });

  const [[afterStudentRow]] = await db
    .promise()
    .query("SELECT status FROM chat_conversations WHERE id = ?", [conversationId]);

  assert.equal(afterStudentRow.status, "waiting_staff");

  await createMessage(db, {
    conversationId,
    userId: TEACHER_USER_ID,
    body: "aqui está a explicação",
  });

  const [[afterTeacherRow]] = await db
    .promise()
    .query("SELECT status FROM chat_conversations WHERE id = ?", [conversationId]);

  assert.equal(afterTeacherRow.status, "waiting_student");

  await createMessage(db, {
    conversationId,
    userId: ENROLLED_STUDENT_USER_ID,
    body: "obrigado, mas ainda tenho uma dúvida",
  });

  const [[backToStaffRow]] = await db
    .promise()
    .query("SELECT status FROM chat_conversations WHERE id = ?", [conversationId]);

  assert.equal(backToStaffRow.status, "waiting_staff");
});

test("resolveConversation: any participant can resolve, and it's idempotent", async () => {
  const conversationId = await openTestQuestion();

  const firstResolve = await resolveConversation(db, { conversationId, userId: ENROLLED_STUDENT_USER_ID });

  assert.equal(firstResolve.resolved, true);

  const [[row]] = await db.promise().query("SELECT status, resolved_at FROM chat_conversations WHERE id = ?", [
    conversationId,
  ]);

  assert.equal(row.status, "resolved");
  assert.ok(row.resolved_at);

  const secondResolve = await resolveConversation(db, { conversationId, userId: TEACHER_USER_ID });

  assert.equal(secondResolve.resolved, false);
});

test("a new message never reopens a resolved conversation", async () => {
  const conversationId = await openTestQuestion();

  await resolveConversation(db, { conversationId, userId: TEACHER_USER_ID });

  await createMessage(db, {
    conversationId,
    userId: ENROLLED_STUDENT_USER_ID,
    body: "obrigado!",
  });

  const [[row]] = await db.promise().query("SELECT status FROM chat_conversations WHERE id = ?", [conversationId]);

  assert.equal(row.status, "resolved");
});

test("the teacher's queue (listConversationsForUser filtered by type) includes the ticket", async () => {
  const conversationId = await openTestQuestion();

  const { items } = await listConversationsForUser(db, {
    userId: TEACHER_USER_ID,
    type: "teacher_support",
    limit: 50,
  });

  const found = items.find((item) => item.conversationId === conversationId);

  assert.ok(found, "teacher_support ticket must appear in the teacher's filtered queue");
  assert.equal(found.otherParticipant?.userId, ENROLLED_STUDENT_USER_ID);
  assert.equal(found.status, "waiting_staff");
});

test("filtering by status narrows the queue to only that status", async () => {
  const openTicketId = await openTestQuestion();
  const resolvedTicketId = await openTestQuestion();

  await resolveConversation(db, { conversationId: resolvedTicketId, userId: TEACHER_USER_ID });

  const { items } = await listConversationsForUser(db, {
    userId: TEACHER_USER_ID,
    type: "teacher_support",
    status: "waiting_staff",
    limit: 50,
  });

  const ids = items.map((item) => item.conversationId);

  assert.ok(ids.includes(openTicketId));
  assert.ok(!ids.includes(resolvedTicketId));
});
