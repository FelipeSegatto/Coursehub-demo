const { test, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");
const {
  buildAcademicPeerKey,
  listAcademicContacts,
  openAcademicPeerConversation,
} = require("../../services/chat/chatAcademicPeerService");
const { isEligibleForAcademicPeer } = require("../../services/chat/chatEligibilityService");

// Real, pre-existing enrollment data (read-only -- no enrollment is
// created or mutated by this file, only chat_* rows, fully cleaned
// up in after()). Verified directly against the dev DB before
// picking these: 65 and 72 share exactly one active enrollment
// (course 6); 3 shares zero courses with either of them.
const STUDENT_A_USER_ID = 65;
const STUDENT_B_USER_ID = 72; // eligible peer of A
const STUDENT_C_USER_ID = 3; // not eligible with A or B

const createdConversationIds = [];

after(async () => {
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

test("buildAcademicPeerKey normalizes regardless of argument order", () => {
  assert.equal(buildAcademicPeerKey(65, 72), buildAcademicPeerKey(72, 65));
  assert.equal(buildAcademicPeerKey(65, 72), "academic_peer:65:72");
});

test("isEligibleForAcademicPeer is true for students sharing an active enrollment", async () => {
  const eligible = await isEligibleForAcademicPeer(db.promise(), {
    userIdA: STUDENT_A_USER_ID,
    userIdB: STUDENT_B_USER_ID,
  });

  assert.equal(eligible, true);
});

test("isEligibleForAcademicPeer is false for students sharing no course", async () => {
  const eligible = await isEligibleForAcademicPeer(db.promise(), {
    userIdA: STUDENT_A_USER_ID,
    userIdB: STUDENT_C_USER_ID,
  });

  assert.equal(eligible, false);
});

test("listAcademicContacts includes an eligible peer and excludes an ineligible one, with only public fields", async () => {
  const items = await listAcademicContacts(db, { userId: STUDENT_A_USER_ID });

  const eligibleEntry = items.find((item) => item.userId === STUDENT_B_USER_ID);
  const ineligibleEntry = items.find((item) => item.userId === STUDENT_C_USER_ID);

  assert.ok(eligibleEntry, "eligible peer must appear in the contacts list");
  assert.equal(ineligibleEntry, undefined, "ineligible user must not appear");

  assert.deepEqual(Object.keys(eligibleEntry).sort(), ["avatarKey", "name", "userId"]);
});

test("openAcademicPeerConversation succeeds for an eligible peer and adds both as participants", async () => {
  const { conversationId, isNew } = await openAcademicPeerConversation(db, {
    userId: STUDENT_A_USER_ID,
    peerUserId: STUDENT_B_USER_ID,
  });

  createdConversationIds.push(conversationId);

  assert.equal(isNew, true);

  const [rows] = await db
    .promise()
    .query("SELECT user_id FROM chat_participants WHERE conversation_id = ? ORDER BY user_id ASC", [
      conversationId,
    ]);

  assert.deepEqual(
    rows.map((row) => row.user_id),
    [STUDENT_A_USER_ID, STUDENT_B_USER_ID].sort((a, b) => a - b)
  );

  const [[conversationRow]] = await db
    .promise()
    .query("SELECT type, channel_kind, conversation_key FROM chat_conversations WHERE id = ?", [conversationId]);

  assert.equal(conversationRow.type, "academic_peer");
  assert.equal(conversationRow.channel_kind, "direct");
  assert.equal(conversationRow.conversation_key, buildAcademicPeerKey(STUDENT_A_USER_ID, STUDENT_B_USER_ID));
});

test("opening the same pair again, from either side, returns the same conversation instead of a duplicate", async () => {
  const opened = await openAcademicPeerConversation(db, {
    userId: STUDENT_A_USER_ID,
    peerUserId: STUDENT_B_USER_ID,
  });

  createdConversationIds.push(opened.conversationId);

  const reopenedByA = await openAcademicPeerConversation(db, {
    userId: STUDENT_A_USER_ID,
    peerUserId: STUDENT_B_USER_ID,
  });

  const reopenedByB = await openAcademicPeerConversation(db, {
    userId: STUDENT_B_USER_ID,
    peerUserId: STUDENT_A_USER_ID,
  });

  assert.equal(reopenedByA.conversationId, opened.conversationId);
  assert.equal(reopenedByA.isNew, false);
  assert.equal(reopenedByB.conversationId, opened.conversationId);
  assert.equal(reopenedByB.isNew, false);

  const [countRows] = await db
    .promise()
    .query("SELECT COUNT(*) AS total FROM chat_conversations WHERE conversation_key = ?", [
      buildAcademicPeerKey(STUDENT_A_USER_ID, STUDENT_B_USER_ID),
    ]);

  assert.equal(Number(countRows[0].total), 1);
});

test("openAcademicPeerConversation rejects a peer who doesn't share an enrollment", async () => {
  await assert.rejects(
    () => openAcademicPeerConversation(db, { userId: STUDENT_A_USER_ID, peerUserId: STUDENT_C_USER_ID }),
    (error) => error.statusCode === 403
  );
});

test("openAcademicPeerConversation rejects opening a conversation with yourself", async () => {
  await assert.rejects(
    () => openAcademicPeerConversation(db, { userId: STUDENT_A_USER_ID, peerUserId: STUDENT_A_USER_ID }),
    (error) => error.statusCode === 400
  );
});
