/**
 * "Who gets notified" logic per business domain. Kept separate from
 * notificationService.js (generic materialization) and from the
 * calling business service (activity/grade/attendance/etc.) so the
 * same resolver can be reused by every event that shares the same
 * audience rule.
 *
 * Every resolver takes a `runner` (pool.promise() or an open
 * transaction connection -- same convention as classAccessService.js)
 * so it can run inside the caller's own transaction.
 */

/**
 * Active-enrollment audience for course/class-scoped academic
 * content (activities, exams, contents, sessions): class_id NULL
 * reaches every actively-enrolled student in the course; a specific
 * class_id narrows it to that class only. Locked/inactive/completed/
 * cancelled enrollments and inactive students never receive new
 * academic publications.
 */
async function resolveActiveStudentsForCourseOrClass(runner, { courseId, classId }) {
  const conditions = ["e.course_id = ?", "e.status = 'active'", "s.status = 'active'"];
  const params = [courseId];

  if (classId !== null && classId !== undefined) {
    conditions.push("e.class_id = ?");
    params.push(classId);
  }

  const [rows] = await runner.query(
    `
      SELECT DISTINCT u.id AS user_id, u.name, u.email
      FROM enrollments e
      INNER JOIN students s ON s.id = e.student_id
      INNER JOIN users u ON u.id = s.user_id
      WHERE ${conditions.join(" AND ")}
    `,
    params
  );

  return rows.map((row) => ({
    userId: row.user_id,
    role: "student",
    name: row.name,
    email: row.email,
  }));
}

/**
 * Professores do curso que devem receber evento de envio: todos os
 * membros ativos de course_teachers, mais o teacher_id legado se
 * ainda não estiver na N:N. Conta inativa não entra. Lista vazia é
 * "ninguém para notificar", não erro.
 */
async function resolveTeachersForCourse(runner, { courseId }) {
  const [rows] = await runner.query(
    `
      SELECT DISTINCT u.id AS user_id, u.name, u.email
      FROM teachers t
      INNER JOIN users u ON u.id = t.user_id
      WHERE t.status = 'active'
        AND u.status = 'active'
        AND (
          EXISTS (
            SELECT 1 FROM course_teachers ct
            WHERE ct.course_id = ?
              AND ct.teacher_id = t.id
              AND ct.status = 'active'
          )
          OR EXISTS (
            SELECT 1 FROM courses c
            WHERE c.id = ? AND c.teacher_id = t.id
          )
        )
    `,
    [courseId, courseId]
  );

  return rows.map((row) => ({
    userId: row.user_id,
    role: "teacher",
    name: row.name,
    email: row.email,
  }));
}

async function resolveTeacherForCourse(runner, { courseId }) {
  const teachers = await resolveTeachersForCourse(runner, { courseId });

  return teachers[0] || null;
}

/**
 * Single-recipient audience: the student who owns a grade/attendance
 * record (used by grade-published and attendance-marked). Returns
 * null if the student or their user account is inactive -- same
 * "nobody to notify" contract as resolveTeacherForCourse.
 */
async function resolveStudentOwner(runner, { studentId }) {
  const [rows] = await runner.query(
    `
      SELECT u.id AS user_id, u.name, u.email
      FROM students s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.id = ?
        AND s.status = 'active'
        AND u.status = 'active'
      LIMIT 1
    `,
    [studentId]
  );

  if (rows.length === 0) {
    return null;
  }

  return { userId: rows[0].user_id, role: "student", name: rows[0].name, email: rows[0].email };
}

/**
 * Multi-recipient audience for institutional calendar events, keyed
 * by academic_calendar_events.scope_type. "institutional" reaches
 * every active student AND every active teacher; all_students/
 * all_teachers narrow to one role; course/class reuse the same
 * active-enrollment rule as academic content.
 */
async function resolveAllActiveStudents(runner) {
  const [rows] = await runner.query(
    `
      SELECT u.id AS user_id, u.name, u.email
      FROM students s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.status = 'active' AND u.status = 'active'
    `
  );

  return rows.map((row) => ({
    userId: row.user_id,
    role: "student",
    name: row.name,
    email: row.email,
  }));
}

async function resolveAllActiveTeachers(runner) {
  const [rows] = await runner.query(
    `
      SELECT u.id AS user_id, u.name, u.email
      FROM teachers t
      INNER JOIN users u ON u.id = t.user_id
      WHERE t.status = 'active' AND u.status = 'active'
    `
  );

  return rows.map((row) => ({
    userId: row.user_id,
    role: "teacher",
    name: row.name,
    email: row.email,
  }));
}

/**
 * Multi-recipient audience for administrative/operational admin
 * notifications (new user registered, checkout completed, payment
 * rejected, invoice overdue milestones, new administrative request,
 * new public contact, etc). There is no separate `admins` table the
 * way there is `students`/`teachers` -- an admin is just a `users` row
 * with role='admin'.
 */
async function resolveAllActiveAdmins(runner) {
  const [rows] = await runner.query(
    `
      SELECT u.id AS user_id, u.name, u.email
      FROM users u
      WHERE u.role = 'admin' AND u.status = 'active'
    `
  );

  return rows.map((row) => ({
    userId: row.user_id,
    role: "admin",
    name: row.name,
    email: row.email,
  }));
}

async function resolveCalendarAudience(runner, { scopeType, courseId, classId }) {
  if (scopeType === "institutional") {
    const [students, teachers] = await Promise.all([
      resolveAllActiveStudents(runner),
      resolveAllActiveTeachers(runner),
    ]);

    return [...students, ...teachers];
  }

  if (scopeType === "all_students") {
    return resolveAllActiveStudents(runner);
  }

  if (scopeType === "all_teachers") {
    return resolveAllActiveTeachers(runner);
  }

  if (scopeType === "course" || scopeType === "class") {
    return resolveActiveStudentsForCourseOrClass(runner, { courseId, classId });
  }

  return [];
}

/**
 * Multi-recipient audience for chat.message.received: every other
 * currently-active (left_at IS NULL) participant of the conversation,
 * regardless of role -- student, teacher, admin, or moderator can all
 * be on the receiving end depending on modality. excludeUserId is
 * normally the sender, but createNotificationEvent's own
 * actorUserId/excludeActor already handles that filter; this resolver
 * still takes it directly so a caller in a genuinely different
 * context (none exist yet) isn't forced through the actor-exclusion
 * path to get the same result. A participant who has left the
 * conversation, or whose own account is inactive, is not notified.
 */
async function resolveOtherActiveParticipants(runner, { conversationId, excludeUserId }) {
  const [rows] = await runner.query(
    `
      SELECT u.id AS user_id, u.name, u.email, cp.participant_role
      FROM chat_participants cp
      INNER JOIN users u ON u.id = cp.user_id
      WHERE cp.conversation_id = ?
        AND cp.left_at IS NULL
        AND cp.user_id <> ?
        AND u.status = 'active'
    `,
    [conversationId, excludeUserId]
  );

  return rows.map((row) => ({
    userId: row.user_id,
    role: row.participant_role,
    name: row.name,
    email: row.email,
  }));
}

module.exports = {
  resolveActiveStudentsForCourseOrClass,
  resolveTeacherForCourse,
  resolveTeachersForCourse,
  resolveStudentOwner,
  resolveAllActiveAdmins,
  resolveCalendarAudience,
  resolveOtherActiveParticipants,
};
