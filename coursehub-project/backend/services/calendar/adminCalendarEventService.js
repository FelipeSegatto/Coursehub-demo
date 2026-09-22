const { aggregateCalendarEvents } = require("./calendarAggregationService");
const { withTransaction } = require("../../utils/dbTransaction");
const { createNotificationEvent } = require("../notifications/notificationService");
const { resolveCalendarAudience } = require("../notifications/notificationRecipientResolvers");

const ALLOWED_EVENT_TYPES = [
  "holiday",
  "break",
  "recess",
  "exam_week",
  "academic_week",
  "enrollment",
  "re_enrollment",
  "grade_deadline",
  "academic_meeting",
  "institutional",
];

const ALLOWED_SCOPE_TYPES = [
  "institutional",
  "all_students",
  "all_teachers",
  "course",
  "class",
];

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

function normalizePositiveId(value) {
  if (value === undefined || value === null || value === "") return null;

  const normalized = Number(value);

  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}

function validateEventPayload(payload) {
  const { event_type, title, start_date, end_date, scope_type } = payload;

  if (!ALLOWED_EVENT_TYPES.includes(event_type)) {
    throw createServiceError("Tipo de evento inválido.", 400);
  }

  if (!title?.trim()) {
    throw createServiceError("O título é obrigatório.", 400);
  }

  if (!start_date) {
    throw createServiceError("A data de início é obrigatória.", 400);
  }

  if (!ALLOWED_SCOPE_TYPES.includes(scope_type)) {
    throw createServiceError("Público-alvo inválido.", 400);
  }

  if (end_date && end_date < start_date) {
    throw createServiceError(
      "A data final não pode ser anterior à data inicial.",
      400
    );
  }
}

/**
 * Confirma coerência entre scope_type/course_id/class_id — mesmo
 * espírito de assertClassBelongsToCourseAndTeacher
 * (classAccessService), mas sem exigir posse de professor: quem
 * cria evento institucional é sempre admin.
 */
async function assertScopeCoherence(runner, { scopeType, courseId, classId }) {
  const scopeNeedsCourse = scopeType === "course" || scopeType === "class";
  const scopeNeedsClass = scopeType === "class";
  const scopeForbidsTarget = !scopeNeedsCourse;

  if (scopeForbidsTarget && (courseId || classId)) {
    throw createServiceError(
      "Este público-alvo não deve informar curso ou turma.",
      400
    );
  }

  if (scopeNeedsCourse && !courseId) {
    throw createServiceError("Informe o curso para este público-alvo.", 400);
  }

  if (scopeNeedsClass && !classId) {
    throw createServiceError("Informe a turma para este público-alvo.", 400);
  }

  if (classId) {
    const [rows] = await runner.execute(
      "SELECT id, course_id FROM classes WHERE id = ? LIMIT 1",
      [classId]
    );

    if (rows.length === 0) {
      throw createServiceError("Turma não encontrada.", 404);
    }

    if (courseId && Number(rows[0].course_id) !== Number(courseId)) {
      throw createServiceError(
        "A turma informada não pertence ao curso selecionado.",
        409
      );
    }
  } else if (courseId) {
    const [rows] = await runner.execute(
      "SELECT id FROM courses WHERE id = ? LIMIT 1",
      [courseId]
    );

    if (rows.length === 0) {
      throw createServiceError("Curso não encontrado.", 404);
    }
  }
}

/**
 * Fires calendar.event.published/changed/cancelled to the audience
 * resolved from the event's own scope_type, inside the caller's own
 * transaction. No-op if the scope resolves to zero eligible
 * recipients (e.g. a course with no active enrollments) --
 * createNotificationEvent already handles an empty recipients array
 * as a silent no-op.
 */
async function notifyCalendarEvent(db, connection, type, event) {
  const recipients = await resolveCalendarAudience(connection, {
    scopeType: event.scope_type,
    courseId: event.course_id,
    classId: event.class_id,
  });

  if (recipients.length === 0) {
    return;
  }

  await createNotificationEvent(db, {
    type,
    sourceType: "calendar_event",
    sourceId: event.id,
    courseId: event.course_id,
    context: {
      eventId: event.id,
      eventTitle: event.title,
      startDate: event.start_date,
      endDate: event.end_date,
      scopeType: event.scope_type,
    },
    recipients,
    connection,
  });
}

function hasRelevantCalendarChange(previous, next) {
  return (
    String(previous.start_date) !== String(next.start_date) ||
    String(previous.end_date) !== String(next.end_date) ||
    previous.start_time !== next.start_time ||
    previous.end_time !== next.end_time ||
    previous.scope_type !== next.scope_type ||
    Number(previous.course_id) !== Number(next.course_id) ||
    Number(previous.class_id) !== Number(next.class_id)
  );
}

async function getEventRowById(runner, id) {
  const [rows] = await runner.execute(
    `
      SELECT
        ace.id, ace.event_type, ace.title, ace.description,
        ace.start_date, ace.end_date, ace.all_day, ace.start_time, ace.end_time,
        ace.scope_type, ace.course_id, ace.class_id, ace.status,
        ace.created_by_user_id, ace.cancelled_at, ace.created_at, ace.updated_at,
        c.name AS course_name,
        cl.name AS class_name
      FROM academic_calendar_events ace
      LEFT JOIN courses c ON c.id = ace.course_id
      LEFT JOIN classes cl ON cl.id = ace.class_id
      WHERE ace.id = ?
      LIMIT 1
    `,
    [id]
  );

  return rows[0] || null;
}

async function getEventById(db, { id }) {
  const normalizedId = normalizePositiveId(id);

  if (!normalizedId) {
    throw createServiceError("ID do evento inválido.", 400);
  }

  const event = await getEventRowById(db.promise(), normalizedId);

  if (!event) {
    throw createServiceError("Evento não encontrado.", 404);
  }

  return event;
}

async function createEvent(db, { userId, payload }) {
  validateEventPayload(payload);

  const courseId = normalizePositiveId(payload.course_id);
  const classId = normalizePositiveId(payload.class_id);

  return withTransaction(db, async (connection) => {
    await assertScopeCoherence(connection, {
      scopeType: payload.scope_type,
      courseId,
      classId,
    });

    const allDay = payload.all_day === undefined ? true : Boolean(payload.all_day);

    const [result] = await connection.execute(
      `
        INSERT INTO academic_calendar_events
        (
          event_type, title, description, start_date, end_date,
          all_day, start_time, end_time, scope_type, course_id, class_id,
          status, created_by_user_id, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NOW(), NOW())
      `,
      [
        payload.event_type,
        payload.title.trim(),
        payload.description?.trim() || null,
        payload.start_date,
        payload.end_date || null,
        allDay ? 1 : 0,
        allDay ? null : payload.start_time || null,
        allDay ? null : payload.end_time || null,
        payload.scope_type,
        courseId,
        classId,
        userId,
      ]
    );

    const event = await getEventRowById(connection, result.insertId);

    // A calendar event has no draft state -- creating it already is
    // the "publish" moment, same as class_sessions.
    await notifyCalendarEvent(db, connection, "calendar.event.published", event);

    return {
      message: "Evento criado com sucesso.",
      event,
    };
  });
}

async function updateEvent(db, { id, payload }) {
  const normalizedId = normalizePositiveId(id);

  if (!normalizedId) {
    throw createServiceError("ID do evento inválido.", 400);
  }

  validateEventPayload(payload);

  const courseId = normalizePositiveId(payload.course_id);
  const classId = normalizePositiveId(payload.class_id);

  return withTransaction(db, async (connection) => {
    const existing = await getEventRowById(connection, normalizedId);

    if (!existing) {
      throw createServiceError("Evento não encontrado.", 404);
    }

    await assertScopeCoherence(connection, {
      scopeType: payload.scope_type,
      courseId,
      classId,
    });

    const allDay = payload.all_day === undefined ? true : Boolean(payload.all_day);

    const [result] = await connection.execute(
      `
        UPDATE academic_calendar_events
        SET
          event_type = ?,
          title = ?,
          description = ?,
          start_date = ?,
          end_date = ?,
          all_day = ?,
          start_time = ?,
          end_time = ?,
          scope_type = ?,
          course_id = ?,
          class_id = ?,
          updated_at = NOW()
        WHERE id = ?
      `,
      [
        payload.event_type,
        payload.title.trim(),
        payload.description?.trim() || null,
        payload.start_date,
        payload.end_date || null,
        allDay ? 1 : 0,
        allDay ? null : payload.start_time || null,
        allDay ? null : payload.end_time || null,
        payload.scope_type,
        courseId,
        classId,
        normalizedId,
      ]
    );

    if (result.affectedRows === 0) {
      throw createServiceError("Não foi possível atualizar o evento.", 404);
    }

    const event = await getEventRowById(connection, normalizedId);

    if (hasRelevantCalendarChange(existing, event)) {
      await notifyCalendarEvent(db, connection, "calendar.event.changed", event);
    }

    return {
      message: "Evento atualizado com sucesso.",
      event,
    };
  });
}

/**
 * Soft cancel — nunca hard delete, mesmo padrão de
 * activities/course_contents/classes.
 */
async function cancelEvent(db, { id }) {
  const normalizedId = normalizePositiveId(id);

  if (!normalizedId) {
    throw createServiceError("ID do evento inválido.", 400);
  }

  return withTransaction(db, async (connection) => {
    const existing = await getEventRowById(connection, normalizedId);

    if (!existing) {
      throw createServiceError("Evento não encontrado.", 404);
    }

    if (existing.status === "cancelled") {
      throw createServiceError("Este evento já está cancelado.", 409);
    }

    await connection.execute(
      `
        UPDATE academic_calendar_events
        SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
        WHERE id = ?
      `,
      [normalizedId]
    );

    const event = await getEventRowById(connection, normalizedId);

    await notifyCalendarEvent(db, connection, "calendar.event.cancelled", event);

    return {
      message: "Evento cancelado com sucesso.",
      event,
    };
  });
}

/**
 * Consulta agregada para o admin — mesmo pipeline usado por
 * aluno/professor, só que sem restrição de escopo além dos filtros
 * explícitos informados.
 */
async function listCalendarForAdmin(db, { from, to, courseId, classId, scopeType, status }) {
  return aggregateCalendarEvents(db, {
    role: "admin",
    from,
    to,
    filters: { courseId, classId, scopeType, status },
  });
}

module.exports = {
  createEvent,
  updateEvent,
  cancelEvent,
  getEventById,
  listCalendarForAdmin,
};
