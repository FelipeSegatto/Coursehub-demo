const { withTransaction } = require("../../utils/dbTransaction");
const { createConversation } = require("./chatConversationService");
const { ensureParticipant, leaveParticipant } = require("./chatParticipantService");

function buildClassGroupKey(classId) {
  return `class_group:${Number(classId)}`;
}

async function listActiveClassStudentUserIds(runner, classId) {
  const [rows] = await runner.query(
    `
      SELECT u.id AS user_id
      FROM enrollments e
      INNER JOIN students s ON s.id = e.student_id AND s.status = 'active'
      INNER JOIN users u ON u.id = s.user_id AND u.status = 'active'
      WHERE e.class_id = ?
        AND e.status = 'active'
    `,
    [classId]
  );

  return rows.map((row) => Number(row.user_id));
}

async function loadClassContext(runner, classId) {
  const [rows] = await runner.query(
    `
      SELECT c.id, c.name, c.course_id, u.id AS teacher_user_id
      FROM classes c
      LEFT JOIN teachers t ON t.id = c.teacher_id
      LEFT JOIN users u ON u.id = t.user_id AND u.status = 'active'
      WHERE c.id = ?
      LIMIT 1
    `,
    [classId]
  );

  return rows[0] || null;
}

async function syncClassGroupParticipants(connection, { conversationId, studentUserIds }) {
  const desired = new Set(studentUserIds.map(Number));
  const [current] = await connection.query(
    `
      SELECT user_id
      FROM chat_participants
      WHERE conversation_id = ?
        AND participant_role = 'student'
    `,
    [conversationId]
  );

  const currentIds = new Set(current.map((row) => Number(row.user_id)));

  for (const userId of desired) {
    await ensureParticipant(connection, {
      conversationId,
      userId,
      participantRole: "student",
    });
  }

  for (const userId of currentIds) {
    if (!desired.has(userId)) {
      await leaveParticipant(connection, { conversationId, userId });
    }
  }
}

/**
 * One standing group per class, keyed by class_group:{classId}.
 * Members are every student with an active enrollment in that class.
 * Teachers stay out — they keep teacher_support tickets.
 * Idempotent: opening the inbox twice never duplicates the conversation.
 */
async function ensureClassGroupForClass(db, { classId }) {
  const normalizedClassId = Number(classId);

  if (!Number.isInteger(normalizedClassId) || normalizedClassId <= 0) {
    return null;
  }

  const runner = db.promise();
  const klass = await loadClassContext(runner, normalizedClassId);

  if (!klass) {
    return null;
  }

  const studentUserIds = await listActiveClassStudentUserIds(runner, normalizedClassId);

  if (studentUserIds.length === 0) {
    return null;
  }

  const conversationKey = buildClassGroupKey(normalizedClassId);
  const title = `Turma ${klass.name}`.slice(0, 180);
  const createdByUserId = klass.teacher_user_id || studentUserIds[0];
  const initiatorRole = klass.teacher_user_id ? "teacher" : "student";

  const [existing] = await runner.query(
    `SELECT id FROM chat_conversations WHERE conversation_key = ? LIMIT 1`,
    [conversationKey]
  );

  let conversationId = existing[0]?.id || null;

  if (!conversationId) {
    try {
      const created = await createConversation(db, {
        type: "academic_peer",
        channelKind: "group",
        title,
        category: "class_group",
        courseId: klass.course_id,
        classId: klass.id,
        createdByUserId,
        initiatorRole,
        conversationKey,
        participants: studentUserIds.map((userId) => ({
          userId,
          participantRole: "student",
        })),
      });

      conversationId = created.conversationId;
    } catch (error) {
      if (error.statusCode !== 409) {
        throw error;
      }

      const [rows] = await runner.query(
        `SELECT id FROM chat_conversations WHERE conversation_key = ? LIMIT 1`,
        [conversationKey]
      );

      conversationId = rows[0]?.id || null;
    }
  }

  if (!conversationId) {
    return null;
  }

  await withTransaction(db, async (connection) => {
    await connection.query(
      `
        UPDATE chat_conversations
        SET title = ?, course_id = ?, class_id = ?, updated_at = NOW()
        WHERE id = ?
      `,
      [title, klass.course_id, klass.id, conversationId]
    );

    await syncClassGroupParticipants(connection, { conversationId, studentUserIds });
  });

  return { conversationId };
}

async function ensureClassGroupsForStudent(db, { userId }) {
  const [rows] = await db.promise().query(
    `
      SELECT DISTINCT e.class_id
      FROM enrollments e
      INNER JOIN students s ON s.id = e.student_id
      WHERE s.user_id = ?
        AND s.status = 'active'
        AND e.status = 'active'
        AND e.class_id IS NOT NULL
    `,
    [userId]
  );

  const groups = [];

  for (const row of rows) {
    const group = await ensureClassGroupForClass(db, { classId: row.class_id });

    if (group) {
      groups.push(group);
    }
  }

  return groups;
}

module.exports = {
  buildClassGroupKey,
  ensureClassGroupForClass,
  ensureClassGroupsForStudent,
};
