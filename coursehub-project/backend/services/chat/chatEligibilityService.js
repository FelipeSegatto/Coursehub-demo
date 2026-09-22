/**
 * "Quem pode falar com quem", one function per modality. Only
 * academic_peer exists so far (Etapa 8) -- teacher_support/
 * administrative_support/staff_support eligibility rules arrive with
 * their own etapas (9-11).
 */

/**
 * Two students are eligible for academic_peer direct chat when they
 * share at least one course where both have an active enrollment.
 * Sharing the same class is already a subset of this (a class
 * belongs to a course), so there's no separate "same class" branch --
 * "mesmo curso ou turma" from the master prompt collapses to "mesmo
 * curso".
 */
async function isEligibleForAcademicPeer(runner, { userIdA, userIdB }) {
  if (!userIdA || !userIdB || userIdA === userIdB) {
    return false;
  }

  const [rows] = await runner.query(
    `
      SELECT 1
      FROM enrollments e1
      INNER JOIN students s1 ON s1.id = e1.student_id AND s1.user_id = ? AND s1.status = 'active'
      INNER JOIN enrollments e2 ON e2.course_id = e1.course_id AND e2.status = 'active'
      INNER JOIN students s2 ON s2.id = e2.student_id AND s2.user_id = ? AND s2.status = 'active'
      WHERE e1.status = 'active'
      LIMIT 1
    `,
    [userIdA, userIdB]
  );

  return rows.length > 0;
}

/**
 * Contacts search: only public academic identity (name, avatar) --
 * never email/phone/document, per the master prompt explicitly.
 * Scoped to active users only; excludes the caller themself.
 */
async function listStudentChatClasses(db, { userId }) {
  const [rows] = await db.promise().query(
    `
      SELECT c.id AS class_id, c.name AS class_name, co.name AS course_name
      FROM enrollments e
      INNER JOIN students s ON s.id = e.student_id AND s.user_id = ? AND s.status = 'active'
      INNER JOIN classes c ON c.id = e.class_id
      INNER JOIN courses co ON co.id = e.course_id
      WHERE e.status = 'active'
        AND e.class_id IS NOT NULL
      ORDER BY c.name ASC
    `,
    [userId]
  );

  return rows.map((row) => ({
    classId: row.class_id,
    name: row.class_name,
    courseName: row.course_name,
  }));
}

/**
 * Contacts search: only public academic identity (name, avatar) --
 * never email/phone/document, per the master prompt explicitly.
 * Scoped to active users only; excludes the caller themself.
 * Optional classId narrows to classmates in that turma; the caller
 * must have an active enrollment there or the list is empty.
 */
async function listEligibleAcademicContacts(db, { userId, search, classId }) {
  const trimmedSearch = typeof search === "string" ? search.trim() : "";
  const normalizedClassId = Number(classId);

  const params = [userId];
  let classClause = "";

  if (classId !== undefined && classId !== null && classId !== "") {
    if (!Number.isInteger(normalizedClassId) || normalizedClassId <= 0) {
      return [];
    }

    classClause = "AND e1.class_id = ? AND e2.class_id = e1.class_id";
    params.push(normalizedClassId);
  }

  let searchClause = "";

  if (trimmedSearch) {
    searchClause = "AND u2.name LIKE ?";
    params.push(`%${trimmedSearch}%`);
  }

  const [rows] = await db.promise().query(
    `
      SELECT DISTINCT u2.id AS user_id, u2.name, u2.avatar_key
      FROM enrollments e1
      INNER JOIN students s1 ON s1.id = e1.student_id AND s1.user_id = ? AND s1.status = 'active'
      INNER JOIN enrollments e2 ON e2.course_id = e1.course_id AND e2.status = 'active' AND e2.student_id <> e1.student_id
      INNER JOIN students s2 ON s2.id = e2.student_id AND s2.status = 'active'
      INNER JOIN users u2 ON u2.id = s2.user_id AND u2.status = 'active'
      WHERE e1.status = 'active'
      ${classClause}
      ${searchClause}
      ORDER BY u2.name ASC
      LIMIT 50
    `,
    params
  );

  return rows.map((row) => ({
    userId: row.user_id,
    name: row.name,
    avatarKey: row.avatar_key,
  }));
}

module.exports = {
  isEligibleForAcademicPeer,
  listEligibleAcademicContacts,
  listStudentChatClasses,
};
