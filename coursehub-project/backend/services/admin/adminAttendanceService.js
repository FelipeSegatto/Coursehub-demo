const { withTransaction } = require("../../utils/dbTransaction");
const { notifyAttendanceFlagged, isRelevantAttendanceChange } = require("../teacher/teacherAttendanceService");

const ALLOWED_ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"];

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

function normalizePagination(page, limit) {
  const normalizedPage =
    Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : DEFAULT_PAGE;

  const normalizedLimit =
    Number.isInteger(Number(limit)) && Number(limit) > 0
      ? Math.min(Number(limit), MAX_LIMIT)
      : DEFAULT_LIMIT;

  return {
    page: normalizedPage,
    limit: normalizedLimit,
    offset: (normalizedPage - 1) * normalizedLimit,
  };
}

function normalizeId(value, message) {
  const normalized = Number(value);

  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw createServiceError(message, 400);
  }

  return normalized;
}

function mapAttendanceRow(row) {
  return {
    id: row.id,
    student: {
      id: row.student_id,
      name: row.student_name,
      registrationNumber: row.registration_number,
    },
    course: { id: row.course_id, name: row.course_name },
    class: { id: row.class_id, name: row.class_name },
    session: {
      id: row.class_session_id,
      title: row.session_title,
      date: row.session_date,
    },
    status: row.status,
    notes: row.notes,
    adjustment:
      row.admin_adjusted_at !== null
        ? {
            adjustedAt: row.admin_adjusted_at,
            adjustedBy: row.admin_adjusted_by_user_id
              ? { id: row.admin_adjusted_by_user_id, name: row.admin_adjusted_by_name }
              : null,
            reason: row.admin_adjustment_reason,
            previousStatus: row.previous_status,
          }
        : null,
  };
}

const BASE_JOIN = `
  FROM attendance att
  INNER JOIN students st ON st.id = att.student_id
  INNER JOIN class_sessions cs ON cs.id = att.class_session_id
  INNER JOIN classes cl ON cl.id = cs.class_id
  INNER JOIN courses c ON c.id = cl.course_id
  LEFT JOIN users adj_u ON adj_u.id = att.admin_adjusted_by_user_id
`;

const SELECT_COLUMNS = `
  att.id, att.student_id, att.class_session_id, att.status, att.notes,
  att.admin_adjusted_at, att.admin_adjusted_by_user_id, att.admin_adjustment_reason, att.previous_status,

  st.name AS student_name, st.registration_number,
  c.id AS course_id, c.name AS course_name,
  cl.id AS class_id, cl.name AS class_name,
  cs.title AS session_title, cs.session_date,
  adj_u.name AS admin_adjusted_by_name
`;

function buildListFilters(filters) {
  const conditions = ["1 = 1"];
  const params = [];

  const search = filters.search?.trim();

  if (search) {
    conditions.push("(st.name LIKE ? OR st.registration_number LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  if (filters.courseId) {
    conditions.push("cl.course_id = ?");
    params.push(normalizeId(filters.courseId, "ID do curso inválido."));
  }

  if (filters.classId) {
    conditions.push("cs.class_id = ?");
    params.push(normalizeId(filters.classId, "ID da turma inválido."));
  }

  if (filters.status) {
    if (!ALLOWED_ATTENDANCE_STATUSES.includes(filters.status)) {
      throw createServiceError("Status de frequência inválido.", 400);
    }

    conditions.push("att.status = ?");
    params.push(filters.status);
  }

  if (filters.from) {
    conditions.push("cs.session_date >= ?");
    params.push(filters.from);
  }

  if (filters.to) {
    conditions.push("cs.session_date <= ?");
    params.push(filters.to);
  }

  if (filters.adjustedOnly === "true" || filters.adjustedOnly === true) {
    conditions.push("att.admin_adjusted_at IS NOT NULL");
  }

  return { whereClause: conditions.join(" AND "), params };
}

async function getAttendanceSummary(db) {
  const [rows] = await db.promise().query(
    `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent,
        SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS late,
        SUM(CASE WHEN status = 'excused' THEN 1 ELSE 0 END) AS excused,
        SUM(CASE WHEN admin_adjusted_at IS NOT NULL THEN 1 ELSE 0 END) AS adjustedCount
      FROM attendance
    `
  );

  const row = rows[0] || {};

  return {
    total: Number(row.total || 0),
    present: Number(row.present || 0),
    absent: Number(row.absent || 0),
    late: Number(row.late || 0),
    excused: Number(row.excused || 0),
    adjustedCount: Number(row.adjustedCount || 0),
  };
}

async function listAttendance(db, filters = {}) {
  const { whereClause, params } = buildListFilters(filters);
  const { page, limit, offset } = normalizePagination(filters.page, filters.limit);

  const [summary, [countRows], [rows]] = await Promise.all([
    getAttendanceSummary(db),
    db.promise().query(`SELECT COUNT(*) AS total ${BASE_JOIN} WHERE ${whereClause}`, params),
    db.promise().query(
      `
        SELECT ${SELECT_COLUMNS}
        ${BASE_JOIN}
        WHERE ${whereClause}
        ORDER BY cs.session_date DESC, att.id DESC
        LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    ),
  ]);

  const total = Number(countRows[0]?.total || 0);

  return {
    data: rows.map(mapAttendanceRow),
    summary,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  };
}

async function getAttendanceById(db, id) {
  const attendanceId = normalizeId(id, "ID do registro de frequência inválido.");

  const [rows] = await db
    .promise()
    .query(`SELECT ${SELECT_COLUMNS} ${BASE_JOIN} WHERE att.id = ? LIMIT 1`, [attendanceId]);

  if (rows.length === 0) {
    throw createServiceError("Registro de frequência não encontrado.", 404);
  }

  return mapAttendanceRow(rows[0]);
}

/**
 * Ajuste administrativo de um status de presença já lançado pelo
 * professor. attendance é a única fonte para esse dado (ao
 * contrário de grades/submissions) — não há tabela espelhada para
 * manter em sincronia.
 */
async function adjustAttendance(db, id, { status, reason }, actingUserId) {
  const attendanceId = normalizeId(id, "ID do registro de frequência inválido.");

  const normalizedReason = typeof reason === "string" ? reason.trim() : "";

  if (!ALLOWED_ATTENDANCE_STATUSES.includes(status)) {
    throw createServiceError("Status de frequência inválido.", 400);
  }

  if (!normalizedReason) {
    throw createServiceError("Informe o motivo do ajuste.", 400);
  }

  await withTransaction(db, async (connection) => {
    const [rows] = await connection.query(
      `
        SELECT
          att.id, att.status, att.student_id, att.class_session_id,
          cs.title AS session_title, cs.session_date,
          cl.name AS class_name,
          c.id AS course_id, c.name AS course_name
        FROM attendance att
        INNER JOIN class_sessions cs ON cs.id = att.class_session_id
        INNER JOIN classes cl ON cl.id = cs.class_id
        INNER JOIN courses c ON c.id = cl.course_id
        WHERE att.id = ?
        FOR UPDATE
      `,
      [attendanceId]
    );

    if (rows.length === 0) {
      throw createServiceError("Registro de frequência não encontrado.", 404);
    }

    const attendance = rows[0];

    await connection.query(
      `
        UPDATE attendance
        SET previous_status = status,
            status = ?,
            admin_adjustment_reason = ?,
            admin_adjusted_at = NOW(),
            admin_adjusted_by_user_id = ?,
            updated_at = NOW()
        WHERE id = ?
      `,
      [status, normalizedReason, actingUserId, attendanceId]
    );

    if (isRelevantAttendanceChange(attendance.status, status)) {
      await notifyAttendanceFlagged(db, connection, {
        attendanceId,
        studentId: attendance.student_id,
        status,
        previousStatus: attendance.status,
        reason: normalizedReason,
        sessionId: attendance.class_session_id,
        sessionTitle: attendance.session_title,
        sessionDate: attendance.session_date,
        courseId: attendance.course_id,
        courseName: attendance.course_name,
        className: attendance.class_name,
      });
    }
  });

  // Read via the pool, after withTransaction has committed -- see the
  // same fix in adminGradeService.adjustGrade for why this must not
  // run inside the transaction callback.
  return getAttendanceById(db, attendanceId);
}

module.exports = {
  createServiceError,
  ALLOWED_ATTENDANCE_STATUSES,
  listAttendance,
  getAttendanceById,
  adjustAttendance,
};
