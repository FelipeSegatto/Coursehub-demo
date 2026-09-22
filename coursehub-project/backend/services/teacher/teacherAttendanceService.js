const {
  getTeacherIdByUserId,
  getClassOwnedByTeacher,
  createServiceError,
} = require("../classes/classAccessService");

const { requireOwnedClass } = require("./teacherClassService");
const { withTransaction } = require("../../utils/dbTransaction");
const { createNotificationEvent } = require("../notifications/notificationService");
const { resolveStudentOwner } = require("../notifications/notificationRecipientResolvers");

const ALLOWED_ATTENDANCE_STATUSES = new Set([
  "present",
  "absent",
  "late",
  "excused",
]);

// "Presença normal não gera ruído" -- only these two statuses are
// themselves notify-worthy; present/excused never trigger a
// notification on their own.
const NOTIFY_WORTHY_STATUSES = new Set(["absent", "late"]);

function isRelevantAttendanceChange(previousStatus, nextStatus) {
  if (previousStatus === null || previousStatus === undefined) {
    return NOTIFY_WORTHY_STATUSES.has(nextStatus);
  }

  if (previousStatus === nextStatus) {
    return false;
  }

  return NOTIFY_WORTHY_STATUSES.has(nextStatus) || NOTIFY_WORTHY_STATUSES.has(previousStatus);
}

/**
 * Fires learning.attendance.flagged to the student who owns the
 * attendance record, inside the caller's own transaction. No-op if
 * the student/user is inactive (resolveStudentOwner returns null).
 */
async function notifyAttendanceFlagged(
  db,
  connection,
  {
    attendanceId,
    studentId,
    status,
    previousStatus,
    reason,
    sessionId,
    sessionTitle,
    sessionDate,
    courseId,
    courseName,
    className,
  }
) {
  const recipient = await resolveStudentOwner(connection, { studentId });

  if (!recipient) {
    return;
  }

  await createNotificationEvent(db, {
    type: "learning.attendance.flagged",
    sourceType: "attendance",
    sourceId: attendanceId,
    courseId,
    context: {
      sessionId,
      studentId,
      sessionTitle,
      sessionDate,
      courseId,
      courseName,
      className,
      status,
      previousStatus: previousStatus ?? null,
      isCorrection: previousStatus !== null && previousStatus !== undefined,
      reason: reason || null,
    },
    recipients: [recipient],
    connection,
  });
}

/**
 * Frequência baseada em data (legado) — mantida temporariamente
 * durante a migração para frequência por sessão. Novas integrações
 * devem usar getSessionAttendance/registerSessionAttendance.
 */
async function getLegacyDateAttendance(db, { userId, classId, date }) {
  const normalizedClassId = Number(classId);
  const attendanceDate = typeof date === "string" ? date.trim() : "";

  if (!Number.isInteger(normalizedClassId) || normalizedClassId <= 0) {
    throw createServiceError("ID da turma inválido.", 400);
  }

  if (!attendanceDate || !/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)) {
    throw createServiceError(
      "A data da frequência é obrigatória e deve estar no formato YYYY-MM-DD.",
      400
    );
  }

  const teacherId = await getTeacherIdByUserId(db.promise(), userId);

  if (!teacherId) {
    throw createServiceError("Professor não encontrado.", 404);
  }

  const classData = await getClassOwnedByTeacher(db.promise(), {
    classId: normalizedClassId,
    teacherId,
  });

  if (!classData) {
    throw createServiceError(
      "Turma não encontrada ou não vinculada a este professor.",
      404
    );
  }

  const [sessionRows] = await db.promise().query(
    `
      SELECT
        cs.id, cs.session_number, cs.title, cs.session_date, cs.start_time,
        cs.end_time, cs.session_type, cs.description, cs.status
      FROM class_sessions cs
      WHERE cs.class_id = ? AND cs.session_date = ? AND cs.status <> 'cancelled'
      ORDER BY cs.start_time ASC, cs.session_number ASC
      LIMIT 1
    `,
    [normalizedClassId, attendanceDate]
  );

  // Pode existir uma data ainda sem sessão cadastrada — os alunos
  // continuam sendo retornados, mas sem registros de frequência salvos.
  const session = sessionRows[0] || null;
  const classSessionId = session?.id || null;

  const [studentRows] = await db.promise().query(
    `
      SELECT
        s.id AS student_id, u.name AS student_name, u.email,
        s.registration_number,
        a.id AS attendance_id, a.class_session_id, a.notes,
        COALESCE(a.status, 'present') AS attendance_status,
        CASE WHEN a.id IS NULL THEN 0 ELSE 1 END AS is_saved
      FROM enrollments e
      INNER JOIN students s ON s.id = e.student_id
      INNER JOIN users u ON u.id = s.user_id
      LEFT JOIN attendance a ON a.student_id = s.id AND a.class_session_id = ?
      WHERE e.class_id = ? AND e.status = 'active' AND s.status = 'active'
      ORDER BY u.name ASC
    `,
    [classSessionId, normalizedClassId]
  );

  const summary = studentRows.reduce(
    (accumulator, student) => {
      accumulator.total += 1;

      const status = student.attendance_status;

      if (Object.prototype.hasOwnProperty.call(accumulator, status)) {
        accumulator[status] += 1;
      }

      if (student.is_saved) {
        accumulator.saved += 1;
      } else {
        accumulator.unsaved += 1;
      }

      return accumulator;
    },
    { total: 0, present: 0, absent: 0, late: 0, excused: 0, saved: 0, unsaved: 0 }
  );

  return {
    class: {
      id: classData.id,
      name: classData.name,
      shift: classData.shift,
      courseId: classData.course_id,
      courseName: classData.course_name,
      startDate: classData.start_date,
      endDate: classData.end_date,
      status: classData.status,
    },
    attendanceDate,
    session: session
      ? {
          id: session.id,
          sessionNumber: session.session_number,
          title: session.title,
          sessionDate: session.session_date,
          startTime: session.start_time,
          endTime: session.end_time,
          sessionType: session.session_type,
          description: session.description,
          status: session.status,
        }
      : null,
    students: studentRows.map((student) => ({
      studentId: student.student_id,
      name: student.student_name,
      email: student.email,
      registrationNumber: student.registration_number,
      attendanceId: student.attendance_id,
      classSessionId: student.class_session_id,
      status: student.attendance_status,
      notes: student.notes ?? "",
      isSaved: Boolean(student.is_saved),
    })),
    summary,
  };
}

/**
 * Carrega a frequência de UM encontro específico: todos os
 * alunos ativos da turma, com o registro de frequência do
 * encontro quando já existir (senão, status padrão "present").
 */
async function getSessionAttendance(db, { userId, classId, sessionId }) {
  const normalizedClassId = Number(classId);
  const normalizedSessionId = Number(sessionId);

  if (
    !Number.isInteger(normalizedClassId) ||
    normalizedClassId <= 0 ||
    !Number.isInteger(normalizedSessionId) ||
    normalizedSessionId <= 0
  ) {
    throw createServiceError("Parâmetros inválidos.", 400);
  }

  const { classData } = await requireOwnedClass(db.promise(), {
    userId,
    classId: normalizedClassId,
  });

  const [sessionRows] = await db.promise().execute(
    `
      SELECT
        cs.id, cs.class_id AS classId, cs.session_number AS sessionNumber,
        cs.title, cs.description, cs.session_date AS sessionDate,
        cs.start_time AS startTime, cs.end_time AS endTime,
        cs.session_type AS sessionType, cs.status
      FROM class_sessions cs
      WHERE cs.id = ? AND cs.class_id = ? AND cs.status <> 'archived'
      LIMIT 1
    `,
    [normalizedSessionId, normalizedClassId]
  );

  if (sessionRows.length === 0) {
    throw createServiceError("Encontro não encontrado para esta turma.", 404);
  }

  const [students] = await db.promise().execute(
    `
      SELECT
        s.id AS studentId, u.name, u.email,
        s.registration_number AS registrationNumber,
        a.id AS attendanceId,
        COALESCE(a.status, 'present') AS status,
        COALESCE(a.notes, '') AS notes,
        CASE WHEN a.id IS NULL THEN 0 ELSE 1 END AS isSaved
      FROM enrollments e
      INNER JOIN students s ON s.id = e.student_id
      INNER JOIN users u ON u.id = s.user_id
      LEFT JOIN attendance a
        ON a.student_id = s.id AND a.class_session_id = ?
      WHERE e.class_id = ? AND e.status = 'active' AND u.status = 'active'
      ORDER BY u.name ASC
    `,
    [normalizedSessionId, normalizedClassId]
  );

  return { class: classData, session: sessionRows[0], students };
}

/**
 * Registra a frequência de um encontro em lote. A chamada só é
 * liberada a partir da data do encontro (canRegisterAttendance),
 * e todo o lote precisa ser de alunos com matrícula ativa.
 */
async function registerSessionAttendance(db, { userId, classId, sessionId, records }) {
  const normalizedClassId = Number(classId);
  const normalizedSessionId = Number(sessionId);

  if (!Number.isInteger(normalizedClassId) || normalizedClassId <= 0) {
    throw createServiceError("ID da turma inválido.", 400);
  }

  if (!Number.isInteger(normalizedSessionId) || normalizedSessionId <= 0) {
    throw createServiceError("ID do encontro inválido.", 400);
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw createServiceError(
      "Envie pelo menos um registro de frequência.",
      400
    );
  }

  const normalizedRecords = records.map((record) => ({
    studentId: Number(record.studentId),
    status: record.status,
    notes:
      typeof record.notes === "string" ? record.notes.trim() || null : null,
  }));

  const invalidRecord = normalizedRecords.find(
    (record) =>
      !Number.isInteger(record.studentId) ||
      record.studentId <= 0 ||
      !ALLOWED_ATTENDANCE_STATUSES.has(record.status) ||
      (record.notes !== null && record.notes.length > 500)
  );

  if (invalidRecord) {
    throw createServiceError(
      "Existe um registro com aluno, status ou observação inválida. As observações podem ter até 500 caracteres.",
      400
    );
  }

  const studentIds = normalizedRecords.map((record) => record.studentId);
  const uniqueStudentIds = [...new Set(studentIds)];

  if (uniqueStudentIds.length !== studentIds.length) {
    throw createServiceError(
      "A requisição possui registros duplicados para o mesmo aluno.",
      400
    );
  }

  return withTransaction(db, async (connection) => {
    const { classData } = await requireOwnedClass(connection, {
      userId,
      classId: normalizedClassId,
    });

    const [sessionRows] = await connection.execute(
      `
        SELECT
          cs.id, cs.class_id AS classId, cs.session_number AS sessionNumber,
          cs.title, cs.session_date AS sessionDate, cs.start_time AS startTime,
          cs.end_time AS endTime, cs.session_type AS sessionType, cs.status,
          cs.session_date AS attendanceOpensAt,
          CASE WHEN CURDATE() >= cs.session_date THEN 1 ELSE 0 END AS canRegisterAttendance
        FROM class_sessions cs
        WHERE cs.id = ? AND cs.class_id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [normalizedSessionId, normalizedClassId]
    );

    if (sessionRows.length === 0) {
      throw createServiceError("Encontro não encontrado para esta turma.", 404);
    }

    const classSession = sessionRows[0];

    if (classSession.status === "cancelled" || classSession.status === "archived") {
      throw createServiceError(
        "Não é possível registrar frequência em um encontro cancelado ou arquivado.",
        400
      );
    }

    if (Number(classSession.canRegisterAttendance) !== 1) {
      const error = createServiceError(
        "A chamada só será liberada a partir da data e do horário de início do encontro.",
        403
      );
      error.extra = { attendanceOpensAt: classSession.attendanceOpensAt };
      throw error;
    }

    const placeholders = uniqueStudentIds.map(() => "?").join(", ");

    const [enrolledRows] = await connection.execute(
      `
        SELECT DISTINCT e.student_id AS studentId
        FROM enrollments e
        INNER JOIN students s ON s.id = e.student_id
        INNER JOIN users u ON u.id = s.user_id
        WHERE e.class_id = ? AND e.status = 'active' AND u.status = 'active'
          AND e.student_id IN (${placeholders})
      `,
      [normalizedClassId, ...uniqueStudentIds]
    );

    const enrolledStudentIds = new Set(
      enrolledRows.map((row) => Number(row.studentId))
    );

    const invalidStudentIds = uniqueStudentIds.filter(
      (studentId) => !enrolledStudentIds.has(studentId)
    );

    if (invalidStudentIds.length > 0) {
      const error = createServiceError(
        "Um ou mais alunos não possuem matrícula ativa nesta turma.",
        400
      );
      error.extra = { invalidStudentIds };
      throw error;
    }

    // Captured BEFORE the upsert so we can tell "first-ever record"
    // apart from "record already existed with a different status" --
    // the only two cases that matter for the notify-worthy rule.
    const [previousRows] = await connection.execute(
      `
        SELECT student_id AS studentId, status
        FROM attendance
        WHERE class_session_id = ? AND student_id IN (${placeholders})
      `,
      [normalizedSessionId, ...uniqueStudentIds]
    );

    const previousStatusByStudentId = new Map(
      previousRows.map((row) => [Number(row.studentId), row.status])
    );

    const valuesPlaceholders = normalizedRecords.map(() => "(?, ?, ?, ?)").join(", ");
    const insertValues = normalizedRecords.flatMap((record) => [
      normalizedSessionId,
      record.studentId,
      record.status,
      record.notes,
    ]);

    const [saveResult] = await connection.execute(
      `
        INSERT INTO attendance (class_session_id, student_id, status, notes)
        VALUES ${valuesPlaceholders}
        ON DUPLICATE KEY UPDATE
          status = VALUES(status), notes = VALUES(notes), updated_at = CURRENT_TIMESTAMP
      `,
      insertValues
    );

    const relevantRecords = normalizedRecords.filter((record) =>
      isRelevantAttendanceChange(
        previousStatusByStudentId.get(record.studentId) ?? null,
        record.status
      )
    );

    if (relevantRecords.length > 0) {
      const [savedRows] = await connection.execute(
        `
          SELECT id, student_id AS studentId, status
          FROM attendance
          WHERE class_session_id = ? AND student_id IN (${placeholders})
        `,
        [normalizedSessionId, ...uniqueStudentIds]
      );

      const attendanceIdByStudentId = new Map(
        savedRows.map((row) => [Number(row.studentId), row.id])
      );

      for (const record of relevantRecords) {
        await notifyAttendanceFlagged(db, connection, {
          attendanceId: attendanceIdByStudentId.get(record.studentId),
          studentId: record.studentId,
          status: record.status,
          previousStatus: previousStatusByStudentId.get(record.studentId) ?? null,
          sessionId: normalizedSessionId,
          sessionTitle: classSession.title,
          sessionDate: classSession.sessionDate,
          courseId: classData.course_id,
          courseName: classData.course_name,
          className: classData.name,
        });
      }
    }

    const summary = normalizedRecords.reduce(
      (accumulator, record) => {
        accumulator.total += 1;
        accumulator[record.status] += 1;

        return accumulator;
      },
      { total: 0, present: 0, absent: 0, late: 0, excused: 0 }
    );

    return {
      classId: normalizedClassId,
      session: {
        id: classSession.id,
        sessionNumber: classSession.sessionNumber,
        title: classSession.title,
        sessionDate: classSession.sessionDate,
        startTime: classSession.startTime,
        endTime: classSession.endTime,
        sessionType: classSession.sessionType,
        status: classSession.status,
      },
      savedRecords: normalizedRecords.length,
      affectedRows: saveResult.affectedRows,
      summary,
    };
  });
}

module.exports = {
  createServiceError,
  getLegacyDateAttendance,
  getSessionAttendance,
  registerSessionAttendance,
  notifyAttendanceFlagged,
  isRelevantAttendanceChange,
};
