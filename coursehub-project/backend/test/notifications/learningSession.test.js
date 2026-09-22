const { test, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();

require("../../services/notifications/eventDefinitions");

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");
const {
  createSession,
  updateSession,
  cancelSession,
} = require("../../services/teacher/teacherSessionService");
const {
  resolveActiveStudentsForCourseOrClass,
} = require("../../services/notifications/notificationRecipientResolvers");

// Fourth disjoint teacher/course/classes fixture -- see the
// convention documented in the other learning*.test.js files.
const TEACHER_USER_ID = 14;
const COURSE_ID = 4;
const CLASS_A_ID = 4;
const CLASS_B_ID = 11;

const createdSessionIds = [];

function uniqueSessionNumber() {
  // Real UNIQUE(class_id, session_number) constraint -- keep well
  // clear of any real seeded session and of other runs of this file.
  return 100000 + Math.floor(Math.random() * 800000);
}

function basePayload(overrides = {}) {
  return {
    sessionNumber: uniqueSessionNumber(),
    title: `TEST ETAPA5C ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: "temporary test session",
    sessionDate: "2026-09-01",
    startTime: "19:00",
    endTime: "21:00",
    sessionType: "class",
    status: "scheduled",
    ...overrides,
  };
}

async function countNotifications(type, sessionId) {
  const [rows] = await db
    .promise()
    .query("SELECT COUNT(*) AS total FROM notifications WHERE type = ? AND source_id = ?", [
      type,
      sessionId,
    ]);

  return Number(rows[0].total);
}

after(async () => {
  if (createdSessionIds.length > 0) {
    const placeholders = createdSessionIds.map(() => "?").join(",");

    await retryOnDeadlock(() =>
      db
        .promise()
        .query(
          `DELETE FROM notifications WHERE type LIKE 'learning.session.%' AND source_id IN (${placeholders})`,
          createdSessionIds
        )
    );

    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM class_sessions WHERE id IN (${placeholders})`, createdSessionIds)
    );
  }

  await retryOnDeadlock(() =>
    db.promise().query("DELETE FROM class_sessions WHERE title LIKE 'TEST ETAPA5C %'")
  );

  await db.promise().end();
});

async function createScheduledSession(classId = CLASS_A_ID, overrides = {}) {
  const result = await createSession(db, {
    userId: TEACHER_USER_ID,
    classId,
    payload: basePayload(overrides),
  });

  createdSessionIds.push(result.session.id);

  return result.session;
}

test("creating a session as scheduled notifies once, scoped to that class only", async () => {
  const expectedRecipients = await resolveActiveStudentsForCourseOrClass(db.promise(), {
    courseId: COURSE_ID,
    classId: CLASS_A_ID,
  });
  const otherClassRecipients = await resolveActiveStudentsForCourseOrClass(db.promise(), {
    courseId: COURSE_ID,
    classId: CLASS_B_ID,
  });

  const session = await createScheduledSession();

  assert.equal(await countNotifications("learning.session.scheduled", session.id), 1);

  const [recipientRows] = await db.promise().query(
    `
      SELECT nr.user_id
      FROM notifications n
      INNER JOIN notification_recipients nr ON nr.notification_id = n.id
      WHERE n.type = 'learning.session.scheduled' AND n.source_id = ?
    `,
    [session.id]
  );
  const recipientUserIds = recipientRows.map((row) => row.user_id);

  expectedRecipients.forEach((expected) => assert.ok(recipientUserIds.includes(expected.userId)));
  otherClassRecipients.forEach((outOfScope) =>
    assert.ok(!recipientUserIds.includes(outOfScope.userId))
  );
});

test("changing the date/time of a scheduled session fires learning.session.changed once", async () => {
  const session = await createScheduledSession();

  await updateSession(db, {
    userId: TEACHER_USER_ID,
    sessionId: session.id,
    payload: basePayload({
      sessionNumber: session.sessionNumber,
      title: session.title,
      sessionDate: "2026-09-15",
    }),
  });

  assert.equal(await countNotifications("learning.session.changed", session.id), 1);
});

test("re-saving the same date/time does not fire learning.session.changed", async () => {
  const session = await createScheduledSession();

  await updateSession(db, {
    userId: TEACHER_USER_ID,
    sessionId: session.id,
    payload: basePayload({
      sessionNumber: session.sessionNumber,
      title: session.title,
      sessionDate: "2026-09-01",
      startTime: "19:00",
      endTime: "21:00",
      description: "just editing description",
    }),
  });

  assert.equal(await countNotifications("learning.session.changed", session.id), 0);
});

test("setting status to cancelled via the general edit form fires learning.session.cancelled", async () => {
  const session = await createScheduledSession();

  await updateSession(db, {
    userId: TEACHER_USER_ID,
    sessionId: session.id,
    payload: basePayload({
      sessionNumber: session.sessionNumber,
      title: session.title,
      status: "cancelled",
    }),
  });

  assert.equal(await countNotifications("learning.session.cancelled", session.id), 1);
});

test("cancelSession on a scheduled session fires learning.session.cancelled once", async () => {
  const session = await createScheduledSession();

  const result = await cancelSession(db, { userId: TEACHER_USER_ID, sessionId: session.id });

  assert.equal(result.alreadyCancelled, false);
  assert.equal(await countNotifications("learning.session.cancelled", session.id), 1);
});

test("cancelSession is idempotent: cancelling twice does not double-notify", async () => {
  const session = await createScheduledSession();

  await cancelSession(db, { userId: TEACHER_USER_ID, sessionId: session.id });
  const second = await cancelSession(db, { userId: TEACHER_USER_ID, sessionId: session.id });

  assert.equal(second.alreadyCancelled, true);
  assert.equal(await countNotifications("learning.session.cancelled", session.id), 1);
});
