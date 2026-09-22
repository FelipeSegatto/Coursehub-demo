/**
 * Encontros (class_sessions) do lado administrativo. Reaproveita a
 * mesma validação/mapeamento/notificação de
 * services/classSessions/classSessionShared.js usada pelo professor
 * -- nunca duplica regra de negócio. O que muda é só a autorização:
 * aqui não existe "posse de turma" (requireOwnedClass), só existência
 * da turma dentro do escopo institucional (sem multi-tenant hoje,
 * então é apenas "a turma existe e não está arquivada"). Nunca chama
 * as funções do professor passando um userId forjado -- são fluxos de
 * autorização genuinamente diferentes.
 */
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

function normalizeId(value, message) {
  const normalized = Number(value);

  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw createServiceError(message, 400);
  }

  return normalized;
}

async function requireExistingClass(runner, classId) {
  const [rows] = await runner.query(
    `
      SELECT
        cl.id, cl.name, cl.shift, cl.status, cl.course_id,
        c.name AS course_name, c.planned_session_count,
        t.id AS teacher_id, t.name AS teacher_name
      FROM classes cl
      INNER JOIN courses c ON c.id = cl.course_id
      LEFT JOIN teachers t ON t.id = cl.teacher_id
      WHERE cl.id = ? AND cl.status <> 'archived'
      LIMIT 1
    `,
    [classId]
  );

  if (rows.length === 0) {
    throw createServiceError("Turma não encontrada.", 404);
  }

  return rows[0];
}

async function getAdminSessionRow(queryExecutor, sessionId) {
  const [rows] = await queryExecutor.query(
    `
      SELECT
        cs.id, cs.class_id, cs.session_number, cs.title, cs.session_date,
        cs.start_time, cs.end_time, cs.session_type, cs.description,
        cs.status, cs.created_at, cs.updated_at,
        cl.name AS class_name, cl.shift, cl.course_id, cl.status AS class_status,
        c.name AS course_name, c.planned_session_count,
        t.name AS teacher_name
      FROM class_sessions cs
      INNER JOIN classes cl ON cl.id = cs.class_id
      INNER JOIN courses c ON c.id = cl.course_id
      LEFT JOIN teachers t ON t.id = cl.teacher_id
      WHERE cs.id = ?
      LIMIT 1
    `,
    [sessionId]
  );

  return rows[0] || null;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDate(value, message) {
  if (!value) return null;

  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw createServiceError(message, 400);
  }

  return value;
}

async function listSessionsForAdmin(db, { classId, status, sessionType, from, to }) {
  const normalizedClassId = normalizeId(classId, "Selecione uma turma válida.");
  const normalizedStatus = typeof status === "string" ? status.trim() : "";
  const normalizedType = typeof sessionType === "string" ? sessionType.trim() : "";
  const normalizedFrom = normalizeDate(from, "A data inicial deve estar no formato YYYY-MM-DD.");
  const normalizedTo = normalizeDate(to, "A data final deve estar no formato YYYY-MM-DD.");

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

  const classData = await requireExistingClass(db.promise(), normalizedClassId);

  const queryParams = [normalizedClassId];
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
    [normalizedClassId]
  );

  const summaryRow = summaryRows[0];
  const plannedSessionCount = Number(classData.planned_session_count || 0);
  const activeSessionCount =
    Number(summaryRow.scheduled_sessions || 0) + Number(summaryRow.completed_sessions || 0);

  return {
    class: {
      id: classData.id,
      name: classData.name,
      shift: classData.shift,
      status: classData.status,
      courseId: classData.course_id,
      courseName: classData.course_name,
      teacher: classData.teacher_id ? { id: classData.teacher_id, name: classData.teacher_name } : null,
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
      totalSessions: Number(summaryRow.total_sessions || 0),
      activeSessionCount,
      scheduled: Number(summaryRow.scheduled_sessions || 0),
      completed: Number(summaryRow.completed_sessions || 0),
      cancelled: Number(summaryRow.cancelled_sessions || 0),
      plannedSessionCount,
      remainingToPlan: plannedSessionCount > 0 ? Math.max(plannedSessionCount - activeSessionCount, 0) : null,
    },
  };
}

async function getSessionForAdmin(db, sessionId) {
  const normalizedSessionId = normalizeId(sessionId, "ID do encontro inválido.");
  const session = await getAdminSessionRow(db.promise(), normalizedSessionId);

  if (!session) {
    throw createServiceError("Encontro não encontrado.", 404);
  }

  return {
    class: {
      id: session.class_id,
      name: session.class_name,
      shift: session.shift,
      status: session.class_status,
      courseId: session.course_id,
      courseName: session.course_name,
      teacher: session.teacher_name ? { name: session.teacher_name } : null,
      plannedSessionCount: session.planned_session_count,
    },
    session: mapClassSession(session),
  };
}

async function createSessionAsAdmin(db, { actorUserId, classId, payload }) {
  const normalizedClassId = normalizeId(classId, "Selecione uma turma válida.");

  const normalized = validateSessionPayload({
    ...payload,
    sessionType: payload.sessionType || "class",
    status: payload.status || "scheduled",
  });

  return withTransaction(db, async (connection) => {
    const classData = await requireExistingClass(connection, normalizedClassId);

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
          normalizedClassId,
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
        throw createServiceError("Já existe uma sessão com esse número nesta turma.", 409);
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
        courseName: classData.course_name,
        classId: normalizedClassId,
        className: classData.name,
        actorUserId,
      });
    }

    const createdSession = await getAdminSessionRow(connection, insertId);

    return { session: mapClassSession(createdSession) };
  });
}

async function updateSessionAsAdmin(db, { actorUserId, sessionId, payload }) {
  const normalizedSessionId = normalizeId(sessionId, "ID do encontro inválido.");
  const normalized = validateSessionPayload(payload);

  return withTransaction(db, async (connection) => {
    const currentSession = await getAdminSessionRow(connection, normalizedSessionId);

    if (!currentSession) {
      throw createServiceError("Encontro não encontrado.", 404);
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
          normalizedSessionId,
        ]
      );
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        throw createServiceError("Já existe uma sessão com esse número nesta turma.", 409);
      }

      throw error;
    }

    const notifyParams = {
      sessionId: normalizedSessionId,
      title: normalized.title,
      sessionDate: normalized.sessionDate,
      startTime: normalized.startTime,
      endTime: normalized.endTime,
      courseId: currentSession.course_id,
      courseName: currentSession.course_name,
      classId: currentSession.class_id,
      className: currentSession.class_name,
      actorUserId,
    };

    const scheduleChanged =
      !datesRepresentSameInstant(currentSession.session_date, normalized.sessionDate) ||
      currentSession.start_time !== normalized.startTime ||
      currentSession.end_time !== normalized.endTime;

    if (currentSession.status === "scheduled" && normalized.status === "scheduled" && scheduleChanged) {
      await notifySessionEvent(db, connection, "learning.session.changed", notifyParams);
    } else if (currentSession.status === "scheduled" && normalized.status === "cancelled") {
      await notifySessionEvent(db, connection, "learning.session.cancelled", notifyParams);
    }

    const updatedSession = await getAdminSessionRow(connection, normalizedSessionId);

    return { session: mapClassSession(updatedSession) };
  });
}

async function cancelSessionAsAdmin(db, { actorUserId, sessionId }) {
  const normalizedSessionId = normalizeId(sessionId, "ID do encontro inválido.");

  return withTransaction(db, async (connection) => {
    const session = await getAdminSessionRow(connection, normalizedSessionId);

    if (!session) {
      throw createServiceError("Encontro não encontrado.", 404);
    }

    if (session.status === "cancelled") {
      return { alreadyCancelled: true, session: mapClassSession(session) };
    }

    const wasScheduled = session.status === "scheduled";

    await connection.query(
      `UPDATE class_sessions SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [normalizedSessionId]
    );

    if (wasScheduled) {
      await notifySessionEvent(db, connection, "learning.session.cancelled", {
        sessionId: normalizedSessionId,
        title: session.title,
        sessionDate: session.session_date,
        startTime: session.start_time,
        endTime: session.end_time,
        courseId: session.course_id,
        courseName: session.course_name,
        classId: session.class_id,
        className: session.class_name,
        actorUserId,
      });
    }

    const cancelledSession = await getAdminSessionRow(connection, normalizedSessionId);

    return { alreadyCancelled: false, session: mapClassSession(cancelledSession) };
  });
}

module.exports = {
  createServiceError,
  listSessionsForAdmin,
  getSessionForAdmin,
  createSessionAsAdmin,
  updateSessionAsAdmin,
  cancelSessionAsAdmin,
};
