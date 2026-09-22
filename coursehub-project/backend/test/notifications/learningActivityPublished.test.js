const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();

require("../../services/notifications/eventDefinitions"); // registers learning.activity.published

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");
const { createActivity, updateActivity } = require("../../services/activities/teacherActivityService");
const {
  resolveActiveStudentsForCourseOrClass,
} = require("../../services/notifications/notificationRecipientResolvers");

// Real teacher/course/class fixtures from the seeded dev DB (Carlos
// Silva, "React do Zero"): course 1 has two classes, 1 (Turma A) and
// 8 (Turma B), each with distinct actively-enrolled students. Used
// read-only for scope lookups; every row this file writes
// (activities + notifications) is deleted in after().
//
// This file owns teacher 11 / course 1. Other activity-notification
// test files run concurrently (separate node:test processes) and
// must use a different teacher/course -- hammering the same real
// classroom rows from two transactions at once caused real InnoDB
// deadlocks (see learningActivityChangedCancelled.test.js).
const TEACHER_USER_ID = 11;
const COURSE_ID = 1;
const CLASS_A_ID = 1;
const CLASS_B_ID = 8;

const createdActivityIds = [];

function basePayload(overrides = {}) {
  return {
    course_id: COURSE_ID,
    activity_kind: "activity",
    title: `TEST ETAPA4 ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: "temporary test activity",
    type: "text",
    max_score: 10,
    questions: [{ question_text: "q1", question_type: "text" }],
    ...overrides,
  };
}

async function countNotificationsForActivity(activityId) {
  const [rows] = await db
    .promise()
    .query(
      "SELECT COUNT(*) AS total FROM notifications WHERE type = 'learning.activity.published' AND source_id = ?",
      [activityId]
    );

  return Number(rows[0].total);
}

async function getRecipientUserIdsForActivity(activityId) {
  const [rows] = await db.promise().query(
    `
      SELECT nr.user_id
      FROM notifications n
      INNER JOIN notification_recipients nr ON nr.notification_id = n.id
      WHERE n.type = 'learning.activity.published' AND n.source_id = ?
    `,
    [activityId]
  );

  return rows.map((row) => row.user_id);
}

after(async () => {
  if (createdActivityIds.length > 0) {
    const placeholders = createdActivityIds.map(() => "?").join(",");

    await retryOnDeadlock(() =>
      db
        .promise()
        .query(
          `DELETE FROM notifications WHERE type = 'learning.activity.published' AND source_id IN (${placeholders})`,
          createdActivityIds
        )
    );

    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM activities WHERE id IN (${placeholders})`, createdActivityIds)
    );
  }

  await retryOnDeadlock(() =>
    db.promise().query("DELETE FROM activities WHERE title LIKE 'TEST ETAPA4 %'")
  );

  await db.promise().end();
});

test("creating an activity as draft does not notify", async () => {
  const result = await createActivity(db, {
    userId: TEACHER_USER_ID,
    payload: basePayload({ class_id: CLASS_A_ID, status: "draft" }),
  });

  createdActivityIds.push(result.activity.id);

  const count = await countNotificationsForActivity(result.activity.id);
  assert.equal(count, 0);
});

test("creating an activity as active notifies once, scoped to the class", async () => {
  const expectedRecipients = await resolveActiveStudentsForCourseOrClass(db.promise(), {
    courseId: COURSE_ID,
    classId: CLASS_A_ID,
  });

  const otherClassRecipients = await resolveActiveStudentsForCourseOrClass(db.promise(), {
    courseId: COURSE_ID,
    classId: CLASS_B_ID,
  });

  const result = await createActivity(db, {
    userId: TEACHER_USER_ID,
    payload: basePayload({ class_id: CLASS_A_ID, status: "active" }),
  });

  createdActivityIds.push(result.activity.id);

  const count = await countNotificationsForActivity(result.activity.id);
  assert.equal(count, 1);

  const recipientUserIds = await getRecipientUserIdsForActivity(result.activity.id);

  assert.equal(recipientUserIds.length, expectedRecipients.length);

  expectedRecipients.forEach((expected) => {
    assert.ok(recipientUserIds.includes(expected.userId), `class A student ${expected.userId} must be notified`);
  });

  otherClassRecipients.forEach((outOfScope) => {
    assert.ok(
      !recipientUserIds.includes(outOfScope.userId),
      `class B student ${outOfScope.userId} must NOT be notified for a class-A-scoped activity`
    );
  });
});

test("draft -> active on update notifies exactly once", async () => {
  const createResult = await createActivity(db, {
    userId: TEACHER_USER_ID,
    payload: basePayload({ class_id: CLASS_A_ID, status: "draft" }),
  });

  createdActivityIds.push(createResult.activity.id);

  assert.equal(await countNotificationsForActivity(createResult.activity.id), 0);

  await updateActivity(db, {
    userId: TEACHER_USER_ID,
    activityId: createResult.activity.id,
    payload: basePayload({
      class_id: CLASS_A_ID,
      status: "active",
      title: createResult.activity.title,
      order_index: 1,
    }),
  });

  assert.equal(await countNotificationsForActivity(createResult.activity.id), 1);

  // A second edit that keeps status "active" (no draft -> active
  // transition happening again) must not create a second event.
  await updateActivity(db, {
    userId: TEACHER_USER_ID,
    activityId: createResult.activity.id,
    payload: basePayload({
      class_id: CLASS_A_ID,
      status: "active",
      title: `${createResult.activity.title} (edited)`,
      order_index: 1,
    }),
  });

  assert.equal(
    await countNotificationsForActivity(createResult.activity.id),
    1,
    "editing an already-active activity must not re-notify"
  );
});

test("a course-wide activity (class_id null) reaches students from both classes", async () => {
  const result = await createActivity(db, {
    userId: TEACHER_USER_ID,
    payload: basePayload({ status: "active" }), // no class_id -> whole course
  });

  createdActivityIds.push(result.activity.id);

  const recipientUserIds = await getRecipientUserIdsForActivity(result.activity.id);

  const classAStudents = await resolveActiveStudentsForCourseOrClass(db.promise(), {
    courseId: COURSE_ID,
    classId: CLASS_A_ID,
  });
  const classBStudents = await resolveActiveStudentsForCourseOrClass(db.promise(), {
    courseId: COURSE_ID,
    classId: CLASS_B_ID,
  });

  assert.ok(classAStudents.length > 0 && classBStudents.length > 0, "fixture classes must have active students");

  [...classAStudents, ...classBStudents].forEach((student) => {
    assert.ok(recipientUserIds.includes(student.userId));
  });
});

test("activity creation never calls the mailer synchronously -- delivery stays queued as pending", async () => {
  const result = await createActivity(db, {
    userId: TEACHER_USER_ID,
    payload: basePayload({ class_id: CLASS_A_ID, status: "active" }),
  });

  createdActivityIds.push(result.activity.id);

  const [deliveryRows] = await db.promise().query(
    `
      SELECT nd.status
      FROM notifications n
      INNER JOIN notification_recipients nr ON nr.notification_id = n.id
      INNER JOIN notification_deliveries nd ON nd.recipient_id = nr.id
      WHERE n.type = 'learning.activity.published' AND n.source_id = ?
    `,
    [result.activity.id]
  );

  assert.ok(deliveryRows.length > 0);
  deliveryRows.forEach((row) => {
    assert.equal(row.status, "pending", "email sending is deferred to the worker, never done inline");
  });
});
