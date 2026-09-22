const { test, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();

require("../../services/notifications/eventDefinitions");

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");
const { createActivity } = require("../../services/activities/teacherActivityService");
const { submitActivityAnswers } = require("../../services/activities/studentActivityService");

// Fifth disjoint teacher/course/class fixture (teacher 15, course 5
// "Introdução ao Node.js e Express", class 5) plus a real enrolled
// student (user 48, student id 15, class 5) -- see the convention in
// the other learning*.test.js files.
const TEACHER_USER_ID = 15;
const COURSE_ID = 5;
const CLASS_ID = 5;
const STUDENT_USER_ID = 48;

const createdActivityIds = [];

async function createActivityWithQuestion() {
  const result = await createActivity(db, {
    userId: TEACHER_USER_ID,
    payload: {
      course_id: COURSE_ID,
      class_id: CLASS_ID,
      activity_kind: "activity",
      title: `TEST ETAPA5D ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      description: "temporary test activity",
      type: "text",
      max_score: 10,
      status: "active",
      questions: [{ question_text: "q1", question_type: "text", points: 10 }],
    },
  });

  createdActivityIds.push(result.activity.id);

  const [questionRows] = await db
    .promise()
    .query("SELECT id FROM activity_questions WHERE activity_id = ? LIMIT 1", [
      result.activity.id,
    ]);

  return { activityId: result.activity.id, questionId: questionRows[0].id };
}

async function countNotifications(type, submissionId) {
  const [rows] = await db
    .promise()
    .query("SELECT COUNT(*) AS total FROM notifications WHERE type = ? AND source_id = ?", [
      type,
      submissionId,
    ]);

  return Number(rows[0].total);
}

after(async () => {
  if (createdActivityIds.length > 0) {
    const placeholders = createdActivityIds.map(() => "?").join(",");

    // createActivityWithQuestion() creates each activity as active,
    // which itself fires learning.activity.published (stage 4/5a
    // behavior) -- that's a second notification type per activity
    // this file needs to clean up, not just learning.submission.received.
    await retryOnDeadlock(() =>
      db
        .promise()
        .query(
          `DELETE FROM notifications WHERE type = 'learning.activity.published' AND source_id IN (${placeholders})`,
          createdActivityIds
        )
    );

    await retryOnDeadlock(() =>
      db.promise().query(
        `
          DELETE n FROM notifications n
          INNER JOIN submissions s ON s.id = n.source_id AND n.type = 'learning.submission.received'
          WHERE s.activity_id IN (${placeholders})
        `,
        createdActivityIds
      )
    );

    // submissions/submission_answers cascade from activities (ON
    // DELETE CASCADE), so deleting the activity is enough.
    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM activities WHERE id IN (${placeholders})`, createdActivityIds)
    );
  }

  await retryOnDeadlock(() =>
    db.promise().query("DELETE FROM activities WHERE title LIKE 'TEST ETAPA5D %'")
  );

  await db.promise().end();
});

test("a confirmed submission notifies the responsible teacher, not the student", async () => {
  const { activityId, questionId } = await createActivityWithQuestion();

  const result = await submitActivityAnswers(db, {
    userId: STUDENT_USER_ID,
    activityId,
    answers: [{ question_id: questionId, answer_text: "my answer" }],
    fullscreenExitCount: 0,
  });

  assert.equal(await countNotifications("learning.submission.received", result.submission.id), 1);

  const [recipientRows] = await db.promise().query(
    `
      SELECT nr.user_id
      FROM notifications n
      INNER JOIN notification_recipients nr ON nr.notification_id = n.id
      WHERE n.type = 'learning.submission.received' AND n.source_id = ?
    `,
    [result.submission.id]
  );

  assert.equal(recipientRows.length, 1);
  assert.equal(recipientRows[0].user_id, TEACHER_USER_ID);
  assert.ok(
    !recipientRows.some((row) => row.user_id === STUDENT_USER_ID),
    "the submitting student must never be a recipient of their own submission notification"
  );
});

test("submitting the same activity twice fails on the second attempt and does not double-notify", async () => {
  const { activityId, questionId } = await createActivityWithQuestion();

  const first = await submitActivityAnswers(db, {
    userId: STUDENT_USER_ID,
    activityId,
    answers: [{ question_id: questionId, answer_text: "first answer" }],
    fullscreenExitCount: 0,
  });

  await assert.rejects(
    submitActivityAnswers(db, {
      userId: STUDENT_USER_ID,
      activityId,
      answers: [{ question_id: questionId, answer_text: "second answer" }],
      fullscreenExitCount: 0,
    }),
    (error) => error.statusCode === 409
  );

  assert.equal(
    await countNotifications("learning.submission.received", first.submission.id),
    1,
    "the rejected second attempt must not create a second notification"
  );
});
