const { test, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();

require("../../services/notifications/eventDefinitions");

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");
const { createActivity } = require("../../services/activities/teacherActivityService");
const { submitActivityAnswers } = require("../../services/activities/studentActivityService");
const { gradeSubmission, quickGradeSubmission } = require("../../services/activities/activityGradingService");
const { adjustGrade } = require("../../services/admin/adminGradeService");

// Sixth disjoint fixture: teacher 16 (course 6), student user 58
// (student id 25, class 13). Chosen specifically outside the
// users.id 1-7 range already claimed by the offset-based
// notification test files (notificationService/Query/DeliveryWorker
// .test.js pick the first 7 active users by id) -- see the
// convention documented across the other learning*.test.js files.
const TEACHER_USER_ID = 16;
const COURSE_ID = 6;
const CLASS_ID = 13;
const STUDENT_ID = 25;
const STUDENT_USER_ID = 58;
const ADMIN_ACTOR_USER_ID = 42; // real admin (Felipe Segatto), used elsewhere in this suite already

const createdActivityIds = [];

async function createActivityWithQuestion(maxScore = 10) {
  const result = await createActivity(db, {
    userId: TEACHER_USER_ID,
    payload: {
      course_id: COURSE_ID,
      class_id: CLASS_ID,
      activity_kind: "activity",
      title: `TEST ETAPA5D2 ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      description: "temporary test activity",
      type: "text",
      max_score: maxScore,
      status: "active",
      questions: [{ question_text: "q1", question_type: "text", points: maxScore }],
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

async function submitAsStudent(activityId, questionId) {
  const result = await submitActivityAnswers(db, {
    userId: STUDENT_USER_ID,
    activityId,
    answers: [{ question_id: questionId, answer_text: "my answer" }],
    fullscreenExitCount: 0,
  });

  return result.submission.id;
}

async function countNotifications(submissionId) {
  const [rows] = await db
    .promise()
    .query(
      "SELECT COUNT(*) AS total FROM notifications WHERE type = 'learning.grade.published' AND source_id = ?",
      [submissionId]
    );

  return Number(rows[0].total);
}

after(async () => {
  if (createdActivityIds.length > 0) {
    const placeholders = createdActivityIds.map(() => "?").join(",");

    // Each created activity indirectly produces up to three
    // notification types: learning.activity.published (from
    // createActivity itself, source_id = activity id) and, per
    // submission, learning.submission.received / learning.grade.published
    // (source_id = submission id, so reached via a join back to
    // submissions.activity_id).
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
          INNER JOIN submissions s ON s.id = n.source_id
          WHERE n.type IN ('learning.submission.received', 'learning.grade.published')
            AND s.activity_id IN (${placeholders})
        `,
        createdActivityIds
      )
    );

    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM activities WHERE id IN (${placeholders})`, createdActivityIds)
    );
  }

  await retryOnDeadlock(() =>
    db.promise().query("DELETE FROM activities WHERE title LIKE 'TEST ETAPA5D2 %'")
  );

  await db.promise().end();
});

test("gradeSubmission notifies the student once on first grading", async () => {
  const { activityId, questionId } = await createActivityWithQuestion();
  const submissionId = await submitAsStudent(activityId, questionId);

  const [answerRows] = await db
    .promise()
    .query("SELECT id FROM submission_answers WHERE submission_id = ?", [submissionId]);

  await gradeSubmission(db, {
    userId: TEACHER_USER_ID,
    submissionId,
    answers: [{ answer_id: answerRows[0].id, score_awarded: 8 }],
    feedback: "good job",
  });

  assert.equal(await countNotifications(submissionId), 1);
});

test("re-grading with the exact same score and feedback does not re-notify", async () => {
  const { activityId, questionId } = await createActivityWithQuestion();
  const submissionId = await submitAsStudent(activityId, questionId);

  const [answerRows] = await db
    .promise()
    .query("SELECT id FROM submission_answers WHERE submission_id = ?", [submissionId]);

  const gradePayload = {
    userId: TEACHER_USER_ID,
    submissionId,
    answers: [{ answer_id: answerRows[0].id, score_awarded: 7 }],
    feedback: "ok",
  };

  await gradeSubmission(db, gradePayload);
  await gradeSubmission(db, gradePayload);

  assert.equal(await countNotifications(submissionId), 1);
});

test("re-grading with a different score notifies again", async () => {
  const { activityId, questionId } = await createActivityWithQuestion();
  const submissionId = await submitAsStudent(activityId, questionId);

  const [answerRows] = await db
    .promise()
    .query("SELECT id FROM submission_answers WHERE submission_id = ?", [submissionId]);

  await gradeSubmission(db, {
    userId: TEACHER_USER_ID,
    submissionId,
    answers: [{ answer_id: answerRows[0].id, score_awarded: 5 }],
    feedback: "needs work",
  });

  await gradeSubmission(db, {
    userId: TEACHER_USER_ID,
    submissionId,
    answers: [{ answer_id: answerRows[0].id, score_awarded: 9 }],
    feedback: "much better on review",
  });

  assert.equal(await countNotifications(submissionId), 2);
});

test("quickGradeSubmission notifies the student", async () => {
  const { activityId, questionId } = await createActivityWithQuestion();
  const submissionId = await submitAsStudent(activityId, questionId);

  await quickGradeSubmission(db, {
    userId: TEACHER_USER_ID,
    submissionId,
    score: 6,
    feedback: "quick override",
  });

  assert.equal(await countNotifications(submissionId), 1);

  const [recipientRows] = await db.promise().query(
    `
      SELECT nr.user_id
      FROM notifications n
      INNER JOIN notification_recipients nr ON nr.notification_id = n.id
      WHERE n.type = 'learning.grade.published' AND n.source_id = ?
    `,
    [submissionId]
  );

  assert.equal(recipientRows.length, 1);
  assert.equal(recipientRows[0].user_id, STUDENT_USER_ID);
});

test("admin adjustGrade notifies the student when the score actually changes", async () => {
  const { activityId, questionId } = await createActivityWithQuestion();
  const submissionId = await submitAsStudent(activityId, questionId);

  await quickGradeSubmission(db, { userId: TEACHER_USER_ID, submissionId, score: 4 });

  const [gradeRows] = await db
    .promise()
    .query("SELECT id FROM grades WHERE submission_id = ? LIMIT 1", [submissionId]);

  await adjustGrade(
    db,
    gradeRows[0].id,
    { score: 8, reason: "regrade after review" },
    ADMIN_ACTOR_USER_ID
  );

  // 2 total: 1 from quickGradeSubmission, 1 from the admin adjustment.
  assert.equal(await countNotifications(submissionId), 2);
});

test("admin adjustGrade does not notify when the score stays the same", async () => {
  const { activityId, questionId } = await createActivityWithQuestion();
  const submissionId = await submitAsStudent(activityId, questionId);

  await quickGradeSubmission(db, { userId: TEACHER_USER_ID, submissionId, score: 3 });

  const [gradeRows] = await db
    .promise()
    .query("SELECT id FROM grades WHERE submission_id = ? LIMIT 1", [submissionId]);

  await adjustGrade(
    db,
    gradeRows[0].id,
    { score: 3, reason: "confirming grade after complaint review" },
    ADMIN_ACTOR_USER_ID
  );

  // Only the 1 from quickGradeSubmission -- the admin adjustment kept
  // the same score, so it must not add a second notification.
  assert.equal(await countNotifications(submissionId), 1);
});
