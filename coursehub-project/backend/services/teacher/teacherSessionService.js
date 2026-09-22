const { requireOwnedClass } = require("./teacherClassService");
const { withTransaction } = require("../../utils/dbTransaction");
const { datesRepresentSameInstant } = require("../../utils/appConfig");
const {
  createServiceError,
  ALLOWED_SESSION_TYPES,
  ALLOWED_SESSION_STATUSES,
  mapClassSession,
  validateSessionPayload,
  notifySessionEvent,
} = require("../classSessions/classSessionShared");

/**
 * Busca uma sessão e confirma que sua turma pertence ao
 * professor identificado por users.id.
 */
async function getTeacherSessionByUserId(db, userId, sessionId, options = {}) {
  const { includeCancelled = true, connection = null } = options;
  const queryExecutor = connection || db.promise();

  const cancelledCondition = includeCancelled
    ? ""
    : "AND cs.status <> 'cancelled'";

  const [rows] = await queryExecutor.query(
    `
      SELECT
        cs.id, cs.class_id, cs.session_number, cs.title, cs.session_date,
        cs.start_time, cs.end_time, cs.session_type, cs.description,
        cs.status, cs.created_at, cs.updated_at,
        cl.name AS class_name, cl.shift, cl.course_id, cl.teacher_id,
        cl.start_date AS class_start_date, cl.end_date AS class_end_date,
        cl.status AS class_status,
        c.name AS course_name, c.planned_session_count,
        t.user_id AS teacher_user_id
      FROM class_sessions cs
      INNER JOIN classes cl ON cl.id = cs.class_id
      INNER JOIN courses c ON c.id = cl.course_id
      INNER JOIN teachers t ON t.user_id = ?
      WHERE cs.id = ? ${cancelledCondition}
        AND (
          cl.teacher_id = t.id
          OR EXISTS (
            SELECT 1 FROM course_teachers ct_access
            WHERE ct_access.course_id = c.id
              AND ct_access.teacher_id = t.id
              AND ct_access.status = 'active'
          )
          OR c.teacher_id = t.id
        )
      LIMIT 1
    `,
    [userId, sessionId]
  );

  return rows[0] || null;
}

/**
 * Lista as sessões de uma turma, com resumo de frequência por
 * sessão e um resumo geral de status.
 */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeSessionDate(value, message) {
  if (!value) return null;

  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw createServiceError(message, 400);
  }

  return value;
}

async function listSessions(db, { userId, classId, status, sessionType, from, to }) {
  const normalizedStatus = typeof status === "string" ? status.trim() : "";
  const normalizedType = typeof sessionType === "string" ? sessionType.trim() : "";
  const normalizedFrom = normalizeSessionDate(from, "A data inicial deve estar no formato YYYY-MM-DD.");
  const normalizedTo = normalizeSessionDate(to, "A data final deve estar no formato YYYY-MM-DD.");

  const allowedStatusFilters = new Set(["", ...ALLOWED_SESSION_STATUSES]);
  const allowedTypeFilters = new Set(["", ...ALLOWED_SESSION_TYPES]);

  if (!allowedStatusFilters.has(normalizedStatus)) {
    throw createServiceError("Status de sessão inválido.", 400);
  }

  if (!allowedTypeFilters.has(normalizedType)) {
    throw createServiceError("Tipo de sessão inválido.", 400);
  }

  if (normalizedFrom && normalizedTo && normalizedFrom > normalizedTo) {
    throw createServiceError("A data inicial não pode ser posterior à data final.", 400);
  }

  const { classData } = await requireOwnedClass(db.promise(), { userId, classId });

  const queryParams = [classId];
  let statusCondition = "";
  let typeCondition = "";
  let fromCondition = "";
  let toCondition = "";

  if (normalizedStatus) {
    statusCondition = "AND cs.status = ?";
    queryParams.push(normalizedStatus);
  }

  if (normalizedType) {
    typeCondition = "AND cs.session_type = ?";
    queryParams.push(normalizedType);
  }

  if (normalizedFrom) {
    fromCondition = "AND cs.session_date >= ?";
    queryParams.push(normalizedFrom);
  }

  if (normalizedTo) {
    toCondition = "AND cs.session_date <= ?";
    queryParams.push(normalizedTo);
  }

  const [sessionRows] = await db.promise().query(
    `
      SELECT
        cs.id, cs.class_id, cs.session_number, cs.title, cs.session_date,
        cs.start_time, cs.end_time, cs.session_type, cs.description,
        cs.status, cs.created_at, cs.updated_at,
        COUNT(a.id) AS attendance_record_count,
        SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) AS present_count,
        SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) AS absent_count,
        SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) AS late_count,
        SUM(CASE WHEN a.status = 'excused' THEN 1 ELSE 0 END) AS excused_count
      FROM class_sessions cs
      LEFT JOIN attendance a ON a.class_session_id = cs.id
      WHERE cs.class_id = ? ${statusCondition} ${typeCondition} ${fromCondition} ${toCondition}
      GROUP BY
        cs.id, cs.class_id, cs.session_number, cs.title, cs.session_date,
        cs.start_time, cs.end_time, cs.session_type, cs.description,
        cs.status, cs.created_at, cs.updated_at
      ORDER BY cs.session_date ASC, cs.start_time ASC, cs.session_number ASC
    `,
    queryParams
  );

  const [summaryRows] = await db.promise().query(
    `
      SELECT
        COUNT(*) AS total_sessions,
        SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled_sessions,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_sessions,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_sessions
      FROM class_sessions
      WHERE class_id = ?
    `,
    [classId]
  );

  const summaryRow = summaryRows[0];
  const plannedSessionCount = Number(classData.planned_session_count || 0);
  const totalSessions = Number(summaryRow.total_sessions || 0);
  const activeSessionCount =
    Number(summaryRow.scheduled_sessions || 0) +
    Number(summaryRow.completed_sessions || 0);

  return {
    class: {
      id: classData.id,
      name: classData.name,
      shift: classData.shift,
      status: classData.status,
      courseId: classData.course_id,
      courseTitle: classData.course_title || classData.course_name,
      plannedSessionCount,
    },
    sessions: sessionRows.map((session) => ({
      ...mapClassSession(session),
      attendanceSummary: {
        total: Number(session.attendance_record_count || 0),
        present: Number(session.present_count || 0),
        absent: Number(session.absent_count || 0),
        late: Number(session.late_count || 0),
        excused: Number(session.excused_count || 0),
      },
    })),
    summary: {
      totalSessions,
      activeSessionCount,
      scheduled: Number(summaryRow.scheduled_sessions || 0),
      completed: Number(summaryRow.completed_sessions || 0),
      cancelled: Number(summaryRow.cancelled_sessions || 0),
      plannedSessionCount,
      remainingToPlan:
        plannedSessionCount > 0
          ? Math.max(plannedSessionCount - activeSessionCount, 0)
          : null,
    },
  };
}

/**
 * Busca uma sessão específica (por sessionId, sem exigir o
 * classId na URL — a posse é confirmada via join com teachers).
 */
async function getSession(db, userId, sessionId) {
  const session = await getTeacherSessionByUserId(db, userId, sessionId);

  if (!session) {
    throw createServiceError(
      "Sessão não encontrada ou não vinculada ao professor.",
      404
    );
  }

  return {
    class: {
      id: session.class_id,
      name: session.class_name,
      shift: session.shift,
      status: session.class_status,
      courseId: session.course_id,
      courseName: session.course_name,
      plannedSessionCount: session.planned_session_count,
    },
    session: mapClassSession(session),
  };
}

/**
 * Cria uma nova sessão de aula para uma turma.
 */
async function createSession(db, { userId, classId, payload }) {
  const normalized = validateSessionPayload({
    ...payload,
    sessionType: payload.sessionType || "class",
    status: payload.status || "scheduled",
  });

  return withTransaction(db, async (connection) => {
    const { classData } = await requireOwnedClass(connection, { userId, classId });

    let insertId;

    try {
      const [result] = await connection.query(
        `
          INSERT INTO class_sessions (
            class_id, session_number, title, session_date, start_time,
            end_time, session_type, description, status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          classId,
          normalized.sessionNumber,
          normalized.title,
          normalized.sessionDate,
          normalized.startTime,
          normalized.endTime,
          normalized.sessionType,
          normalized.description,
          normalized.status,
        ]
      );

      insertId = result.insertId;
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        throw createServiceError(
          "Já existe uma sessão com esse número nesta turma.",
          409
        );
      }

      throw error;
    }

    if (normalized.status === "scheduled") {
      await notifySessionEvent(db, connection, "learning.session.scheduled", {
        sessionId: insertId,
        title: normalized.title,
        sessionDate: normalized.sessionDate,
        startTime: normalized.startTime,
        endTime: normalized.endTime,
        courseId: classData.course_id,
        courseName: classData.course_title || classData.course_name,
        classId,
        className: classData.name,
        actorUserId: userId,
      });
    }

    const createdSession = await getTeacherSessionByUserId(db, userId, insertId, { connection });

    return { session: mapClassSession(createdSession) };
  });
}

/**
 * Edita uma sessão existente (identificada só por sessionId).
 */
async function updateSession(db, { userId, sessionId, payload }) {
  const normalized = validateSessionPayload(payload);

  return withTransaction(db, async (connection) => {
    const currentSession = await getTeacherSessionByUserId(db, userId, sessionId, { connection });

    if (!currentSession) {
      throw createServiceError(
        "Sessão não encontrada ou não vinculada ao professor.",
        404
      );
    }

    try {
      await connection.query(
        `
          UPDATE class_sessions
          SET
            session_number = ?, title = ?, session_date = ?, start_time = ?,
            end_time = ?, session_type = ?, description = ?, status = ?
          WHERE id = ?
        `,
        [
          normalized.sessionNumber,
          normalized.title,
          normalized.sessionDate,
          normalized.startTime,
          normalized.endTime,
          normalized.sessionType,
          normalized.description,
          normalized.status,
          sessionId,
        ]
      );
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        throw createServiceError(
          "Já existe uma sessão com esse número nesta turma.",
          409
        );
      }

      throw error;
    }

    const notifyParams = {
      sessionId,
      title: normalized.title,
      sessionDate: normalized.sessionDate,
      startTime: normalized.startTime,
      endTime: normalized.endTime,
      courseId: currentSession.course_id,
      courseName: currentSession.course_name,
      classId: currentSession.class_id,
      className: currentSession.class_name,
      actorUserId: userId,
    };

    const scheduleChanged =
      !datesRepresentSameInstant(currentSession.session_date, normalized.sessionDate) ||
      currentSession.start_time !== normalized.startTime ||
      currentSession.end_time !== normalized.endTime;

    if (
      currentSession.status === "scheduled" &&
      normalized.status === "scheduled" &&
      scheduleChanged
    ) {
      await notifySessionEvent(db, connection, "learning.session.changed", notifyParams);
    } else if (currentSession.status === "scheduled" && normalized.status === "cancelled") {
      // Same cancellation as cancelSession, reached through the
      // general edit form instead of the dedicated endpoint -- both
      // paths must notify (mirrors the activity/content alignment).
      await notifySessionEvent(db, connection, "learning.session.cancelled", notifyParams);
    }

    const updatedSession = await getTeacherSessionByUserId(db, userId, sessionId, { connection });

    return { session: mapClassSession(updatedSession) };
  });
}

/**
 * Cancela (soft) uma sessão — nunca remove fisicamente.
 * Idempotente: cancelar uma sessão já cancelada só confirma.
 */
async function cancelSession(db, { userId, sessionId }) {
  return withTransaction(db, async (connection) => {
    const session = await getTeacherSessionByUserId(db, userId, sessionId, { connection });

    if (!session) {
      throw createServiceError(
        "Sessão não encontrada ou não vinculada ao professor.",
        404
      );
    }

    if (session.status === "cancelled") {
      return { alreadyCancelled: true, session: mapClassSession(session) };
    }

    const wasScheduled = session.status === "scheduled";

    await connection.query(
      `
        UPDATE class_sessions
        SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [sessionId]
    );

    if (wasScheduled) {
      await notifySessionEvent(db, connection, "learning.session.cancelled", {
        sessionId,
        title: session.title,
        sessionDate: session.session_date,
        startTime: session.start_time,
        endTime: session.end_time,
        courseId: session.course_id,
        courseName: session.course_name,
        classId: session.class_id,
        className: session.class_name,
        actorUserId: userId,
      });
    }

    const cancelledSession = await getTeacherSessionByUserId(db, userId, sessionId, { connection });

    return { alreadyCancelled: false, session: mapClassSession(cancelledSession) };
  });
}

module.exports = {
  createServiceError,
  mapClassSession,
  getTeacherSessionByUserId,
  listSessions,
  getSession,
  createSession,
  updateSession,
  cancelSession,
};
