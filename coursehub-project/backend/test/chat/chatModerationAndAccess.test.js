const { test, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");
require("../../services/notifications/eventDefinitions"); // registers chat.message.received
const { openAcademicPeerConversation } = require("../../services/chat/chatAcademicPeerService");
const { openTeacherQuestion } = require("../../services/chat/chatTeacherSupportService");
const { createMessage, listMessages } = require("../../services/chat/chatMessageService");
const { reportMessage, listReports, reviewReport, deleteMessage } = require("../../services/chat/chatModerationService");
const {
  canSuperviseConversation,
  getConversationForSupervisor,
  listMessagesForSupervisor,
  listAccessLogs,
} = require("../../services/chat/chatAccessService");
const { grantPermission, revokePermission } = require("../../services/admin/adminPermissionService");

// Real, pre-existing data (read-only -- no course/enrollment row is
// created or mutated, only chat_*/admin_permissions rows, fully
// cleaned up in after()). Students 1/2 (Lucas Almeida, Marina Costa)
// share course 6, kept disjoint from every other chat test file's own
// student pair (65/72, 83, 69/31) per this project's convention --
// academic_peer has no dedicated supervise_* key, only
// chat.audit_access reaches it, which is exactly the case this file
// needs. Teacher 19/course 9/student 69 is the same
// chatTeacherSupport.test.js fixture (reused read-only) --
// teacher_support DOES have a dedicated supervise key. Admin 42
// (Felipe Segatto) is granted/revoked chat.supervise_teacher_support
// and chat.audit_access within these tests, never left active
// afterward.
const STUDENT_A_USER_ID = 1;
const STUDENT_B_USER_ID = 2;
const TEACHER_USER_ID = 19;
const TEACHER_ID = 9; // teachers.id for TEACHER_USER_ID -- openTeacherQuestion requires an explicit teacherId now.
const COURSE_ID = 9;
const ENROLLED_STUDENT_USER_ID = 69;
const ADMIN_USER_ID = 42;

const createdConversationIds = [];
const grantedPermissionKeys = new Set();

async function openTestAcademicConversation() {
  const result = await openAcademicPeerConversation(db, { userId: STUDENT_A_USER_ID, peerUserId: STUDENT_B_USER_ID });

  createdConversationIds.push(result.conversationId);

  return result.conversationId;
}

async function openTestTeacherSupportConversation() {
  const result = await openTeacherQuestion(db, {
    userId: ENROLLED_STUDENT_USER_ID,
    courseId: COURSE_ID,
    teacherId: TEACHER_ID,
    topic: "content",
    subject: `TEST ETAPA12 subject ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    body: "Preciso de ajuda com o conteúdo.",
  });

  createdConversationIds.push(result.conversationId);

  return result.conversationId;
}

async function grantTestPermission(permissionKey) {
  await grantPermission(db, { userId: ADMIN_USER_ID, permissionKey, grantedByUserId: ADMIN_USER_ID });
  grantedPermissionKeys.add(permissionKey);
}

after(async () => {
  for (const permissionKey of grantedPermissionKeys) {
    await revokePermission(db, { userId: ADMIN_USER_ID, permissionKey });
  }

  await db
    .promise()
    .query(`DELETE FROM admin_permissions WHERE user_id = ? AND permission_key IN ('chat.supervise_teacher_support', 'chat.audit_access')`, [
      ADMIN_USER_ID,
    ]);

  if (createdConversationIds.length > 0) {
    const placeholders = createdConversationIds.map(() => "?").join(",");

    // Every message sent through these fixture conversations now
    // also fires chat.message.received (Etapa 13) -- clean those up
    // too, or real recipient accounts (e.g. the shared teacher/admin
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
      db.promise().query(`DELETE FROM chat_access_logs WHERE conversation_id IN (${placeholders})`, createdConversationIds)
    );

    await retryOnDeadlock(() =>
      db
        .promise()
        .query(
          `DELETE FROM chat_reports WHERE message_id IN (SELECT id FROM chat_messages WHERE conversation_id IN (${placeholders}))`,
          createdConversationIds
        )
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

test("reportMessage creates an open report for a participant of the message's conversation", async () => {
  const conversationId = await openTestAcademicConversation();

  const message = await createMessage(db, { conversationId, userId: STUDENT_A_USER_ID, body: "mensagem de teste" });

  const result = await reportMessage(db, {
    messageId: message.messageId,
    reporterUserId: STUDENT_B_USER_ID,
    reason: "spam",
    details: "parece propaganda",
  });

  assert.equal(result.reported, true);

  const { items } = await listReports(db, { status: "open", limit: 50 });
  const found = items.find((item) => item.messageId === message.messageId);

  assert.ok(found);
  assert.equal(found.reason, "spam");
  assert.equal(found.reporterUserId, STUDENT_B_USER_ID);
  assert.equal(found.status, "open");
});

test("reportMessage rejects an invalid reason", async () => {
  const conversationId = await openTestAcademicConversation();
  const message = await createMessage(db, { conversationId, userId: STUDENT_A_USER_ID, body: "outra mensagem" });

  await assert.rejects(
    () => reportMessage(db, { messageId: message.messageId, reporterUserId: STUDENT_B_USER_ID, reason: "not_a_real_reason" }),
    (error) => error.statusCode === 400
  );
});

test("reportMessage rejects a second report from the same reporter", async () => {
  const conversationId = await openTestAcademicConversation();
  const message = await createMessage(db, { conversationId, userId: STUDENT_A_USER_ID, body: "mensagem repetida" });

  await reportMessage(db, { messageId: message.messageId, reporterUserId: STUDENT_B_USER_ID, reason: "spam" });

  await assert.rejects(
    () => reportMessage(db, { messageId: message.messageId, reporterUserId: STUDENT_B_USER_ID, reason: "abuse" }),
    (error) => error.statusCode === 409
  );
});

test("reportMessage rejects someone who isn't a participant of the message's conversation", async () => {
  const conversationId = await openTestAcademicConversation();
  const message = await createMessage(db, { conversationId, userId: STUDENT_A_USER_ID, body: "mensagem privada" });

  await assert.rejects(
    () => reportMessage(db, { messageId: message.messageId, reporterUserId: ENROLLED_STUDENT_USER_ID, reason: "spam" }),
    (error) => error.statusCode === 404
  );
});

test("reviewReport resolves an open report with a note", async () => {
  const conversationId = await openTestAcademicConversation();
  const message = await createMessage(db, { conversationId, userId: STUDENT_A_USER_ID, body: "mensagem a revisar" });
  const report = await reportMessage(db, { messageId: message.messageId, reporterUserId: STUDENT_B_USER_ID, reason: "other" });

  const { items } = await listReports(db, { status: "open", limit: 50 });
  const reportRow = items.find((item) => item.messageId === report.messageId);

  const result = await reviewReport(db, {
    reportId: reportRow.id,
    adminUserId: ADMIN_USER_ID,
    status: "resolved",
    resolutionNote: "conteúdo verificado, sem problema",
  });

  assert.equal(result.status, "resolved");

  const [[dbRow]] = await db
    .promise()
    .query("SELECT status, reviewed_by_user_id, resolution_note FROM chat_reports WHERE id = ?", [reportRow.id]);

  assert.equal(dbRow.status, "resolved");
  assert.equal(dbRow.reviewed_by_user_id, ADMIN_USER_ID);
  assert.equal(dbRow.resolution_note, "conteúdo verificado, sem problema");
});

test("reviewReport rejects an invalid status and a nonexistent report id", async () => {
  await assert.rejects(
    () => reviewReport(db, { reportId: 1, adminUserId: ADMIN_USER_ID, status: "not_a_real_status" }),
    (error) => error.statusCode === 400
  );

  await assert.rejects(
    () => reviewReport(db, { reportId: 999999999, adminUserId: ADMIN_USER_ID, status: "dismissed" }),
    (error) => error.statusCode === 404
  );
});

test("deleteMessage lets the sender remove their own message, and it becomes a placeholder for other participants", async () => {
  const conversationId = await openTestAcademicConversation();
  const message = await createMessage(db, { conversationId, userId: STUDENT_A_USER_ID, body: "vou apagar isso" });

  const result = await deleteMessage(db, { messageId: message.messageId, userId: STUDENT_A_USER_ID });

  assert.equal(result.deleted, true);

  const { items } = await listMessages(db, { conversationId, userId: STUDENT_B_USER_ID, limit: 30 });
  const found = items.find((item) => item.messageId === message.messageId);

  assert.equal(found.isDeleted, true);
  assert.equal(found.body, null);
});

test("deleteMessage is idempotent on an already-deleted message", async () => {
  const conversationId = await openTestAcademicConversation();
  const message = await createMessage(db, { conversationId, userId: STUDENT_A_USER_ID, body: "apagar duas vezes" });

  await deleteMessage(db, { messageId: message.messageId, userId: STUDENT_A_USER_ID });
  const second = await deleteMessage(db, { messageId: message.messageId, userId: STUDENT_A_USER_ID });

  assert.equal(second.deleted, true);
});

test("deleteMessage rejects a non-sender who isn't a supervising admin", async () => {
  const conversationId = await openTestAcademicConversation();
  const message = await createMessage(db, { conversationId, userId: STUDENT_A_USER_ID, body: "não pode apagar" });

  await assert.rejects(
    () => deleteMessage(db, { messageId: message.messageId, userId: STUDENT_B_USER_ID }),
    (error) => error.statusCode === 403
  );
});

test("deleteMessage rejects an admin without the matching supervision permission", async () => {
  const conversationId = await openTestTeacherSupportConversation();
  const message = await createMessage(db, { conversationId, userId: ENROLLED_STUDENT_USER_ID, body: "mensagem do aluno" });

  await assert.rejects(
    () => deleteMessage(db, { messageId: message.messageId, userId: ADMIN_USER_ID }),
    (error) => error.statusCode === 403
  );
});

test("deleteMessage allows an admin with the matching supervision permission", async () => {
  await grantTestPermission("chat.supervise_teacher_support");

  const conversationId = await openTestTeacherSupportConversation();
  const message = await createMessage(db, { conversationId, userId: ENROLLED_STUDENT_USER_ID, body: "mensagem removível" });

  const result = await deleteMessage(db, { messageId: message.messageId, userId: ADMIN_USER_ID });

  assert.equal(result.deleted, true);

  await revokePermission(db, { userId: ADMIN_USER_ID, permissionKey: "chat.supervise_teacher_support" });
});

test("canSuperviseConversation: no permission denies every modality", async () => {
  const allowed = await canSuperviseConversation(db.promise(), {
    adminUserId: ADMIN_USER_ID,
    conversationType: "teacher_support",
  });

  assert.equal(allowed, false);
});

test("chat.audit_access grants supervision of a modality with no dedicated supervise key (academic_peer)", async () => {
  await grantTestPermission("chat.audit_access");

  const conversationId = await openTestAcademicConversation();

  const allowed = await canSuperviseConversation(db.promise(), {
    adminUserId: ADMIN_USER_ID,
    conversationType: "academic_peer",
  });

  assert.equal(allowed, true);

  const detail = await getConversationForSupervisor(db, {
    conversationId,
    adminUserId: ADMIN_USER_ID,
    accessReason: "safety",
    details: "verificação de rotina",
  });

  assert.equal(detail.conversationId, conversationId);
  assert.equal(detail.type, "academic_peer");
  assert.equal(detail.participants.length, 2);

  await revokePermission(db, { userId: ADMIN_USER_ID, permissionKey: "chat.audit_access" });
});

test("getConversationForSupervisor returns 403 (not 404) when the conversation exists but permission is missing", async () => {
  const conversationId = await openTestTeacherSupportConversation();

  await assert.rejects(
    () =>
      getConversationForSupervisor(db, {
        conversationId,
        adminUserId: ADMIN_USER_ID,
        accessReason: "support",
      }),
    (error) => error.statusCode === 403
  );
});

test("getConversationForSupervisor returns 404 for a conversation that doesn't exist", async () => {
  await grantTestPermission("chat.audit_access");

  await assert.rejects(
    () =>
      getConversationForSupervisor(db, {
        conversationId: 999999999,
        adminUserId: ADMIN_USER_ID,
        accessReason: "support",
      }),
    (error) => error.statusCode === 404
  );

  await revokePermission(db, { userId: ADMIN_USER_ID, permissionKey: "chat.audit_access" });
});

test("a successful supervised read is logged to chat_access_logs, and listMessagesForSupervisor shows the original body of a soft-deleted message", async () => {
  await grantTestPermission("chat.supervise_teacher_support");

  const conversationId = await openTestTeacherSupportConversation();
  const message = await createMessage(db, { conversationId, userId: ENROLLED_STUDENT_USER_ID, body: "conteúdo original" });

  await deleteMessage(db, { messageId: message.messageId, userId: ENROLLED_STUDENT_USER_ID });

  await getConversationForSupervisor(db, {
    conversationId,
    adminUserId: ADMIN_USER_ID,
    accessReason: "report_review",
    details: "revisão de report",
  });

  const { items: logItems } = await listAccessLogs(db, { conversationId, limit: 20 });

  assert.equal(logItems.length, 1);
  assert.equal(logItems[0].adminUserId, ADMIN_USER_ID);
  assert.equal(logItems[0].accessReason, "report_review");

  const { items: supervisedMessages } = await listMessagesForSupervisor(db, {
    conversationId,
    adminUserId: ADMIN_USER_ID,
    limit: 30,
  });

  const found = supervisedMessages.find((item) => item.messageId === message.messageId);

  assert.equal(found.isDeleted, true);
  assert.equal(found.body, "conteúdo original");

  await revokePermission(db, { userId: ADMIN_USER_ID, permissionKey: "chat.supervise_teacher_support" });
});
