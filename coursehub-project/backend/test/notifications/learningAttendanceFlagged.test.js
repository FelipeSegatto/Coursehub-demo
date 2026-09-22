const { test, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();

require("../../services/notifications/eventDefinitions");

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");
const { formatDateOnly } = require("../../utils/appConfig");
const { createSession } = require("../../services/teacher/teacherSessionService");
const { registerSessionAttendance } = require("../../services/teacher/teacherAttendanceService");
const { adjustAttendance } = require("../../services/admin/adminAttendanceService");

// Seventh disjoint fixture: teacher 17 (course 7, class 7), students
// 16/49 and 19/52. Chosen outside the users.id 1-7 range (generic
// offset-based tests) and outside teachers 11-16 already claimed by
// the other learning*.test.js files -- see the convention documented
// across this suite.
const TEACHER_USER_ID = 17;
const CLASS_ID = 7;
const STUDENT_A_ID = 16; // user 49
const STUDENT_B_ID = 19; // user 52
const ADMIN_ACTOR_USER_ID = 42; // real admin (Felipe Segatto), used elsewhere in this suite already

let sessionCounter = 0;
const createdSessionIds = [];

async function createTestSession() {
  sessionCounter += 1;

  const result = await createSession(db, {
    userId: TEACHER_USER_ID,
    classId: CLASS_ID,
    payload: {
      sessionNumber: 9000 + sessionCounter,
      title: `TEST ETAPA5D3 ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      // formatDateOnly, not toISOString -- toISOString cuts by UTC,
      // which can already be "tomorrow" relative to the DB server's
      // local CURDATE() late in the day (confirmed: this flipped a
      // previously-passing test to a consistent failure once real
      // wall-clock time crossed the UTC/local date boundary).
      sessionDate: formatDateOnly(new Date()),
      startTime: "08:00",
      endTime: "10:00",
      sessionType: "class",
    },
  });

  const sessionId = result.session.id;
  createdSessionIds.push(sessionId);

  return sessionId;
}

async function getAttendanceId(sessionId, studentId) {
  const [rows] = await db
    .promise()
    .query(
      "SELECT id FROM attendance WHERE class_session_id = ? AND student_id = ? LIMIT 1",
      [sessionId, studentId]
    );

  return rows[0].id;
}

async function countNotifications(attendanceId) {
  const [rows] = await db
    .promise()
    .query(
      "SELECT COUNT(*) AS total FROM notifications WHERE type = 'learning.attendance.flagged' AND source_id = ?",
      [attendanceId]
    );

  return Number(rows[0].total);
}

after(async () => {
  if (createdSessionIds.length > 0) {
    const placeholders = createdSessionIds.map(() => "?").join(",");

    await retryOnDeadlock(() =>
      db.promise().query(
        `
          DELETE n FROM notifications n
          INNER JOIN attendance a ON a.id = n.source_id
          WHERE n.type = 'learning.attendance.flagged'
            AND a.class_session_id IN (${placeholders})
        `,
        createdSessionIds
      )
    );

    // class_sessions -> attendance cascades (fk_attendance_class_session).
    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM class_sessions WHERE id IN (${placeholders})`, createdSessionIds)
    );
  }

  await retryOnDeadlock(() =>
    db.promise().query("DELETE FROM class_sessions WHERE title LIKE 'TEST ETAPA5D3 %'")
  );

  await db.promise().end();
});

test("registering 'present' on first save does not notify", async () => {
  const sessionId = await createTestSession();

  await registerSessionAttendance(db, {
    userId: TEACHER_USER_ID,
    classId: CLASS_ID,
    sessionId,
    records: [{ studentId: STUDENT_A_ID, status: "present" }],
  });

  const attendanceId = await getAttendanceId(sessionId, STUDENT_A_ID);

  assert.equal(await countNotifications(attendanceId), 0);
});

test("registering 'excused' on first save does not notify", async () => {
  const sessionId = await createTestSession();

  await registerSessionAttendance(db, {
    userId: TEACHER_USER_ID,
    classId: CLASS_ID,
    sessionId,
    records: [{ studentId: STUDENT_A_ID, status: "excused" }],
  });

  const attendanceId = await getAttendanceId(sessionId, STUDENT_A_ID);

  assert.equal(await countNotifications(attendanceId), 0);
});

test("registering 'absent' on first save notifies the student", async () => {
  const sessionId = await createTestSession();

  await registerSessionAttendance(db, {
    userId: TEACHER_USER_ID,
    classId: CLASS_ID,
    sessionId,
    records: [{ studentId: STUDENT_A_ID, status: "absent" }],
  });

  const attendanceId = await getAttendanceId(sessionId, STUDENT_A_ID);

  assert.equal(await countNotifications(attendanceId), 1);

  const [recipientRows] = await db.promise().query(
    `
      SELECT nr.user_id
      FROM notifications n
      INNER JOIN notification_recipients nr ON nr.notification_id = n.id
      WHERE n.type = 'learning.attendance.flagged' AND n.source_id = ?
    `,
    [attendanceId]
  );

  assert.equal(recipientRows.length, 1);
  assert.equal(recipientRows[0].user_id, 49);
});

test("registering 'late' on first save notifies the student", async () => {
  const sessionId = await createTestSession();

  await registerSessionAttendance(db, {
    userId: TEACHER_USER_ID,
    classId: CLASS_ID,
    sessionId,
    records: [{ studentId: STUDENT_A_ID, status: "late" }],
  });

  const attendanceId = await getAttendanceId(sessionId, STUDENT_A_ID);

  assert.equal(await countNotifications(attendanceId), 1);
});

test("re-saving the identical status does not re-notify", async () => {
  const sessionId = await createTestSession();

  await registerSessionAttendance(db, {
    userId: TEACHER_USER_ID,
    classId: CLASS_ID,
    sessionId,
    records: [{ studentId: STUDENT_A_ID, status: "absent" }],
  });

  await registerSessionAttendance(db, {
    userId: TEACHER_USER_ID,
    classId: CLASS_ID,
    sessionId,
    records: [{ studentId: STUDENT_A_ID, status: "absent" }],
  });

  const attendanceId = await getAttendanceId(sessionId, STUDENT_A_ID);

  assert.equal(await countNotifications(attendanceId), 1);
});

test("correcting present -> absent notifies (moving into notify-worthy)", async () => {
  const sessionId = await createTestSession();

  await registerSessionAttendance(db, {
    userId: TEACHER_USER_ID,
    classId: CLASS_ID,
    sessionId,
    records: [{ studentId: STUDENT_A_ID, status: "present" }],
  });

  await registerSessionAttendance(db, {
    userId: TEACHER_USER_ID,
    classId: CLASS_ID,
    sessionId,
    records: [{ studentId: STUDENT_A_ID, status: "absent" }],
  });

  const attendanceId = await getAttendanceId(sessionId, STUDENT_A_ID);

  assert.equal(await countNotifications(attendanceId), 1);
});

test("correcting absent -> present notifies again (relevant correction out of notify-worthy)", async () => {
  const sessionId = await createTestSession();

  await registerSessionAttendance(db, {
    userId: TEACHER_USER_ID,
    classId: CLASS_ID,
    sessionId,
    records: [{ studentId: STUDENT_A_ID, status: "absent" }],
  });

  await registerSessionAttendance(db, {
    userId: TEACHER_USER_ID,
    classId: CLASS_ID,
    sessionId,
    records: [{ studentId: STUDENT_A_ID, status: "present" }],
  });

  const attendanceId = await getAttendanceId(sessionId, STUDENT_A_ID);

  assert.equal(await countNotifications(attendanceId), 2);
});

test("correcting present -> excused does not notify (neither side notify-worthy)", async () => {
  const sessionId = await createTestSession();

  await registerSessionAttendance(db, {
    userId: TEACHER_USER_ID,
    classId: CLASS_ID,
    sessionId,
    records: [{ studentId: STUDENT_A_ID, status: "present" }],
  });

  await registerSessionAttendance(db, {
    userId: TEACHER_USER_ID,
    classId: CLASS_ID,
    sessionId,
    records: [{ studentId: STUDENT_A_ID, status: "excused" }],
  });

  const attendanceId = await getAttendanceId(sessionId, STUDENT_A_ID);

  assert.equal(await countNotifications(attendanceId), 0);
});

test("a batch only notifies the students whose status is relevant", async () => {
  const sessionId = await createTestSession();

  await registerSessionAttendance(db, {
    userId: TEACHER_USER_ID,
    classId: CLASS_ID,
    sessionId,
    records: [
      { studentId: STUDENT_A_ID, status: "present" },
      { studentId: STUDENT_B_ID, status: "absent" },
    ],
  });

  const attendanceIdA = await getAttendanceId(sessionId, STUDENT_A_ID);
  const attendanceIdB = await getAttendanceId(sessionId, STUDENT_B_ID);

  assert.equal(await countNotifications(attendanceIdA), 0);
  assert.equal(await countNotifications(attendanceIdB), 1);
});

test("admin adjustAttendance notifies when correcting into a notify-worthy status", async () => {
  const sessionId = await createTestSession();

  await registerSessionAttendance(db, {
    userId: TEACHER_USER_ID,
    classId: CLASS_ID,
    sessionId,
    records: [{ studentId: STUDENT_A_ID, status: "present" }],
  });

  const attendanceId = await getAttendanceId(sessionId, STUDENT_A_ID);

  await adjustAttendance(
    db,
    attendanceId,
    { status: "absent", reason: "confirmado com a coordenação" },
    ADMIN_ACTOR_USER_ID
  );

  assert.equal(await countNotifications(attendanceId), 1);
});

test("admin adjustAttendance does not notify when the status stays the same", async () => {
  const sessionId = await createTestSession();

  await registerSessionAttendance(db, {
    userId: TEACHER_USER_ID,
    classId: CLASS_ID,
    sessionId,
    records: [{ studentId: STUDENT_A_ID, status: "absent" }],
  });

  const attendanceId = await getAttendanceId(sessionId, STUDENT_A_ID);

  await adjustAttendance(
    db,
    attendanceId,
    { status: "absent", reason: "confirmando após contestação" },
    ADMIN_ACTOR_USER_ID
  );

  // Only the 1 from the teacher's original registration -- the admin
  // adjustment kept the same status, so it must not add a second one.
  assert.equal(await countNotifications(attendanceId), 1);
});

test("admin adjustAttendance does not notify moving between two non-notify-worthy statuses", async () => {
  const sessionId = await createTestSession();

  await registerSessionAttendance(db, {
    userId: TEACHER_USER_ID,
    classId: CLASS_ID,
    sessionId,
    records: [{ studentId: STUDENT_A_ID, status: "present" }],
  });

  const attendanceId = await getAttendanceId(sessionId, STUDENT_A_ID);

  await adjustAttendance(
    db,
    attendanceId,
    { status: "excused", reason: "atestado entregue posteriormente" },
    ADMIN_ACTOR_USER_ID
  );

  assert.equal(await countNotifications(attendanceId), 0);
});
