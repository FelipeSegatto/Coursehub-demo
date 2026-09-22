const { test, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();

require("../../services/notifications/eventDefinitions");

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");
const {
  createActivity,
  updateActivity,
  deactivateActivity,
} = require("../../services/activities/teacherActivityService");

// Different teacher/course/classes than learningActivityPublished.test.js
// (teacher 11 / course 1 / classes 1+8) on purpose: both files run
// concurrently in separate node:test processes, and having them
// hammer createActivity/updateActivity against the exact same real
// classroom rows at once was causing genuine (if rare) InnoDB
// deadlocks between the two unrelated transactions -- disjoint
// fixtures avoid the contention entirely, same principle as the
// disjoint user OFFSETs used elsewhere in this test suite.
const TEACHER_USER_ID = 12;
const COURSE_ID = 2;
const CLASS_A_ID = 2;
const CLASS_B_ID = 9;

const createdActivityIds = [];

function basePayload(overrides = {}) {
  return {
    course_id: COURSE_ID,
    activity_kind: "activity",
    title: `TEST ETAPA5A ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: "temporary test activity",
    type: "text",
    max_score: 10,
    questions: [{ question_text: "q1", question_type: "text" }],
    ...overrides,
  };
}

async function countNotifications(type, activityId) {
  const [rows] = await db
    .promise()
    .query("SELECT COUNT(*) AS total FROM notifications WHERE type = ? AND source_id = ?", [
      type,
      activityId,
    ]);

  return Number(rows[0].total);
}

after(async () => {
  if (createdActivityIds.length > 0) {
    const placeholders = createdActivityIds.map(() => "?").join(",");

    await retryOnDeadlock(() =>
      db
        .promise()
        .query(
          `DELETE FROM notifications WHERE type LIKE 'learning.activity.%' AND source_id IN (${placeholders})`,
          createdActivityIds
        )
    );

    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM activities WHERE id IN (${placeholders})`, createdActivityIds)
    );
  }

  await retryOnDeadlock(() =>
    db.promise().query("DELETE FROM activities WHERE title LIKE 'TEST ETAPA5A %'")
  );

  await db.promise().end();
});

async function createActiveActivity(overrides = {}) {
  const result = await createActivity(db, {
    userId: TEACHER_USER_ID,
    payload: basePayload({ class_id: CLASS_A_ID, status: "active", ...overrides }),
  });

  createdActivityIds.push(result.activity.id);

  return result.activity;
}

test("changing the due date of an active activity fires learning.activity.changed once", async () => {
  const activity = await createActiveActivity({ due_date: "2026-09-01 23:59:00" });

  await updateActivity(db, {
    userId: TEACHER_USER_ID,
    activityId: activity.id,
    payload: basePayload({
      class_id: CLASS_A_ID,
      status: "active",
      title: activity.title,
      due_date: "2026-09-15 23:59:00",
    }),
  });

  assert.equal(await countNotifications("learning.activity.changed", activity.id), 1);
  assert.equal(await countNotifications("learning.activity.published", activity.id), 1); // from creation, unaffected
});

test("re-saving the same due date does not fire learning.activity.changed", async () => {
  const activity = await createActiveActivity({ due_date: "2026-09-01 23:59:00" });

  await updateActivity(db, {
    userId: TEACHER_USER_ID,
    activityId: activity.id,
    payload: basePayload({
      class_id: CLASS_A_ID,
      status: "active",
      title: activity.title,
      due_date: "2026-09-01 23:59:00",
      description: "just editing description, same due date",
    }),
  });

  assert.equal(await countNotifications("learning.activity.changed", activity.id), 0);
});

test("changing the class scope of an active activity fires learning.activity.changed", async () => {
  const activity = await createActiveActivity({ class_id: CLASS_A_ID, due_date: "2026-09-01 23:59:00" });

  await updateActivity(db, {
    userId: TEACHER_USER_ID,
    activityId: activity.id,
    payload: basePayload({
      class_id: CLASS_B_ID,
      status: "active",
      title: activity.title,
      due_date: "2026-09-01 23:59:00",
    }),
  });

  assert.equal(await countNotifications("learning.activity.changed", activity.id), 1);
});

test("retrying the exact same due-date change dedupes to a single event", async () => {
  const activity = await createActiveActivity({ due_date: "2026-09-01 23:59:00" });

  const updatedPayload = basePayload({
    class_id: CLASS_A_ID,
    status: "active",
    title: activity.title,
    due_date: "2026-10-01 23:59:00",
  });

  await updateActivity(db, { userId: TEACHER_USER_ID, activityId: activity.id, payload: updatedPayload });
  await updateActivity(db, { userId: TEACHER_USER_ID, activityId: activity.id, payload: updatedPayload });

  assert.equal(await countNotifications("learning.activity.changed", activity.id), 1);
});

test("deactivating an active activity fires learning.activity.cancelled once", async () => {
  const activity = await createActiveActivity();

  await deactivateActivity(db, { userId: TEACHER_USER_ID, activityId: activity.id });

  assert.equal(await countNotifications("learning.activity.cancelled", activity.id), 1);
});

test("setting status to inactive via the general edit form also fires learning.activity.cancelled", async () => {
  // Same real-world effect as deactivateActivity (students lose
  // access), reached through a different code path -- must notify
  // too, not just the dedicated endpoint.
  const activity = await createActiveActivity();

  await updateActivity(db, {
    userId: TEACHER_USER_ID,
    activityId: activity.id,
    payload: basePayload({
      class_id: CLASS_A_ID,
      status: "inactive",
      title: activity.title,
    }),
  });

  assert.equal(await countNotifications("learning.activity.cancelled", activity.id), 1);
});

test("deactivating a draft activity (never active) does not notify", async () => {
  const result = await createActivity(db, {
    userId: TEACHER_USER_ID,
    payload: basePayload({ class_id: CLASS_A_ID, status: "draft" }),
  });

  createdActivityIds.push(result.activity.id);

  await deactivateActivity(db, { userId: TEACHER_USER_ID, activityId: result.activity.id });

  assert.equal(await countNotifications("learning.activity.cancelled", result.activity.id), 0);
});

test("deactivating an already-inactive activity still throws 409, unchanged behavior", async () => {
  const activity = await createActiveActivity();

  await deactivateActivity(db, { userId: TEACHER_USER_ID, activityId: activity.id });

  await assert.rejects(
    deactivateActivity(db, { userId: TEACHER_USER_ID, activityId: activity.id }),
    (error) => error.statusCode === 409
  );

  // Still exactly one cancellation event, the second attempt never
  // got far enough to fire another.
  assert.equal(await countNotifications("learning.activity.cancelled", activity.id), 1);
});
