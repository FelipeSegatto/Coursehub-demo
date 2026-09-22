const { test, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();

require("../../services/notifications/eventDefinitions");

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");
const {
  createCourseContent,
  updateCourseContent,
  archiveCourseContent,
} = require("../../services/courseContents/teacherCourseContentService");
const {
  resolveActiveStudentsForCourseOrClass,
} = require("../../services/notifications/notificationRecipientResolvers");

// Third disjoint teacher/course/classes fixture -- see the
// convention documented in learningActivityPublished.test.js /
// learningActivityChangedCancelled.test.js: each activity/content
// notification test file owns its own real teacher so concurrent
// node:test processes never hammer the same classroom rows.
const TEACHER_USER_ID = 13;
const COURSE_ID = 3;
const CLASS_A_ID = 3;
const CLASS_B_ID = 10;

const createdContentIds = [];

function basePayload(overrides = {}) {
  return {
    course_id: COURSE_ID,
    title: `TEST ETAPA5B ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: "temporary test content",
    type: "text",
    content_text: "lorem ipsum",
    order_index: 1,
    ...overrides,
  };
}

async function countNotifications(type, contentId) {
  const [rows] = await db
    .promise()
    .query("SELECT COUNT(*) AS total FROM notifications WHERE type = ? AND source_id = ?", [
      type,
      contentId,
    ]);

  return Number(rows[0].total);
}

after(async () => {
  if (createdContentIds.length > 0) {
    const placeholders = createdContentIds.map(() => "?").join(",");

    await retryOnDeadlock(() =>
      db
        .promise()
        .query(
          `DELETE FROM notifications WHERE type LIKE 'learning.content.%' AND source_id IN (${placeholders})`,
          createdContentIds
        )
    );

    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM course_contents WHERE id IN (${placeholders})`, createdContentIds)
    );
  }

  await retryOnDeadlock(() =>
    db.promise().query("DELETE FROM course_contents WHERE title LIKE 'TEST ETAPA5B %'")
  );

  await db.promise().end();
});

async function createContent(overrides = {}) {
  const result = await createCourseContent(db, {
    userId: TEACHER_USER_ID,
    payload: basePayload(overrides),
  });

  createdContentIds.push(result.id);

  return result;
}

test("creating a content as draft does not notify", async () => {
  const content = await createContent({ class_id: CLASS_A_ID, status: "draft" });

  assert.equal(await countNotifications("learning.content.published", content.id), 0);
});

test("creating a content as active notifies once, scoped to the class", async () => {
  const expectedRecipients = await resolveActiveStudentsForCourseOrClass(db.promise(), {
    courseId: COURSE_ID,
    classId: CLASS_A_ID,
  });
  const otherClassRecipients = await resolveActiveStudentsForCourseOrClass(db.promise(), {
    courseId: COURSE_ID,
    classId: CLASS_B_ID,
  });

  const content = await createContent({ class_id: CLASS_A_ID, status: "active" });

  assert.equal(await countNotifications("learning.content.published", content.id), 1);

  const [recipientRows] = await db.promise().query(
    `
      SELECT nr.user_id
      FROM notifications n
      INNER JOIN notification_recipients nr ON nr.notification_id = n.id
      WHERE n.type = 'learning.content.published' AND n.source_id = ?
    `,
    [content.id]
  );
  const recipientUserIds = recipientRows.map((row) => row.user_id);

  expectedRecipients.forEach((expected) => {
    assert.ok(recipientUserIds.includes(expected.userId));
  });
  otherClassRecipients.forEach((outOfScope) => {
    assert.ok(!recipientUserIds.includes(outOfScope.userId));
  });
});

test("draft -> active on update notifies exactly once", async () => {
  const content = await createContent({ class_id: CLASS_A_ID, status: "draft" });

  assert.equal(await countNotifications("learning.content.published", content.id), 0);

  await updateCourseContent(db, {
    userId: TEACHER_USER_ID,
    contentId: content.id,
    payload: basePayload({ class_id: CLASS_A_ID, status: "active", title: content.title }),
  });

  assert.equal(await countNotifications("learning.content.published", content.id), 1);

  await updateCourseContent(db, {
    userId: TEACHER_USER_ID,
    contentId: content.id,
    payload: basePayload({
      class_id: CLASS_A_ID,
      status: "active",
      title: `${content.title} (edited)`,
    }),
  });

  assert.equal(
    await countNotifications("learning.content.published", content.id),
    1,
    "re-saving an already-active content must not re-fire published"
  );
});

test("changing the due date of an active content fires learning.content.changed once", async () => {
  const content = await createContent({
    class_id: CLASS_A_ID,
    status: "active",
    due_date: "2026-09-01",
  });

  await updateCourseContent(db, {
    userId: TEACHER_USER_ID,
    contentId: content.id,
    payload: basePayload({
      class_id: CLASS_A_ID,
      status: "active",
      title: content.title,
      due_date: "2026-09-20",
    }),
  });

  assert.equal(await countNotifications("learning.content.changed", content.id), 1);
});

test("re-saving the same due date does not fire learning.content.changed", async () => {
  const content = await createContent({
    class_id: CLASS_A_ID,
    status: "active",
    due_date: "2026-09-01",
  });

  await updateCourseContent(db, {
    userId: TEACHER_USER_ID,
    contentId: content.id,
    payload: basePayload({
      class_id: CLASS_A_ID,
      status: "active",
      title: content.title,
      due_date: "2026-09-01",
      description: "just editing description",
    }),
  });

  assert.equal(await countNotifications("learning.content.changed", content.id), 0);
});

test("archiving an active content fires learning.content.cancelled once", async () => {
  const content = await createContent({ class_id: CLASS_A_ID, status: "active" });

  await archiveCourseContent(db, { userId: TEACHER_USER_ID, contentId: content.id });

  assert.equal(await countNotifications("learning.content.cancelled", content.id), 1);
});

test("archiving a draft content (never active) does not notify", async () => {
  const content = await createContent({ class_id: CLASS_A_ID, status: "draft" });

  await archiveCourseContent(db, { userId: TEACHER_USER_ID, contentId: content.id });

  assert.equal(await countNotifications("learning.content.cancelled", content.id), 0);
});

test("archiving an already-archived content still throws 409", async () => {
  const content = await createContent({ class_id: CLASS_A_ID, status: "active" });

  await archiveCourseContent(db, { userId: TEACHER_USER_ID, contentId: content.id });

  await assert.rejects(
    archiveCourseContent(db, { userId: TEACHER_USER_ID, contentId: content.id }),
    (error) => error.statusCode === 409
  );

  assert.equal(await countNotifications("learning.content.cancelled", content.id), 1);
});
