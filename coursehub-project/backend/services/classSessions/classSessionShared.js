/**
 * Núcleo compartilhado de class_sessions ("Encontros" na interface),
 * reaproveitado por services/teacher/teacherSessionService.js (exige
 * posse da turma) e services/admin/adminClassSessionService.js (exige
 * role administrativa + existência da turma, nunca posse). Só o que é
 * realmente igual entre os dois papéis vive aqui: validação de
 * payload, mapeamento de linha e disparo de notificação -- a
 * verificação de autorização (quem pode agir sobre qual turma) nunca
 * entra aqui de propósito, cada wrapper decide isso à sua maneira.
 */
const { createServiceError } = require("../classes/classAccessService");
const { createNotificationEvent } = require("../notifications/notificationService");
const {
  resolveActiveStudentsForCourseOrClass,
} = require("../notifications/notificationRecipientResolvers");

const ALLOWED_SESSION_TYPES = new Set([
  "class",
  "review",
  "exam",
  "presentation",
  "workshop",
  "lab",
  "recovery",
  "other",
]);

const ALLOWED_SESSION_STATUSES = new Set(["scheduled", "completed", "cancelled"]);

function isValidDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidTimeString(value) {
  if (value === null || value === undefined || value === "") {
    return true;
  }

  if (typeof value !== "string" || !/^\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    return false;
  }

  const [hours, minutes, seconds = "00"] = value.split(":");
  const parsedHours = Number(hours);
  const parsedMinutes = Number(minutes);
  const parsedSeconds = Number(seconds);

  return (
    parsedHours >= 0 &&
    parsedHours <= 23 &&
    parsedMinutes >= 0 &&
    parsedMinutes <= 59 &&
    parsedSeconds >= 0 &&
    parsedSeconds <= 59
  );
}

function normalizeTimeValue(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized = value.trim();

  if (/^\d{2}:\d{2}$/.test(normalized)) {
    return `${normalized}:00`;
  }

  return normalized;
}

function mapClassSession(session) {
  return {
    id: session.id,
    classId: session.class_id,
    sessionNumber: session.session_number,
    title: session.title,
    sessionDate: session.session_date,
    startTime: session.start_time,
    endTime: session.end_time,
    sessionType: session.session_type,
    description: session.description,
    status: session.status,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
  };
}

function validateSessionPayload({
  sessionNumber,
  title,
  description,
  sessionDate,
  startTime,
  endTime,
  sessionType,
  status,
}) {
  const normalizedSessionNumber = Number(sessionNumber);
  const normalizedTitle = typeof title === "string" ? title.trim() : "";
  const normalizedStartTime = normalizeTimeValue(startTime);
  const normalizedEndTime = normalizeTimeValue(endTime);

  if (!Number.isInteger(normalizedSessionNumber) || normalizedSessionNumber <= 0) {
    throw createServiceError("O número da sessão deve ser um inteiro maior que zero.", 400);
  }

  if (!normalizedTitle) {
    throw createServiceError("O título da sessão é obrigatório.", 400);
  }

  if (normalizedTitle.length > 180) {
    throw createServiceError("O título da sessão deve possuir no máximo 180 caracteres.", 400);
  }

  if (!isValidDateString(sessionDate)) {
    throw createServiceError("A data da sessão é obrigatória e deve usar o formato YYYY-MM-DD.", 400);
  }

  if (!isValidTimeString(normalizedStartTime) || !isValidTimeString(normalizedEndTime)) {
    throw createServiceError("Os horários devem usar o formato HH:MM ou HH:MM:SS.", 400);
  }

  if (normalizedStartTime && normalizedEndTime && normalizedEndTime <= normalizedStartTime) {
    throw createServiceError("O horário final deve ser posterior ao horário inicial.", 400);
  }

  if (!ALLOWED_SESSION_TYPES.has(sessionType)) {
    throw createServiceError("Tipo de sessão inválido.", 400);
  }

  if (!ALLOWED_SESSION_STATUSES.has(status)) {
    throw createServiceError("Status de sessão inválido.", 400);
  }

  return {
    sessionNumber: normalizedSessionNumber,
    title: normalizedTitle,
    description: typeof description === "string" ? description.trim() || null : null,
    sessionDate,
    startTime: normalizedStartTime,
    endTime: normalizedEndTime,
    sessionType,
    status,
  };
}

/**
 * Compartilhado por todo evento learning.session.* -- actorUserId é
 * sempre req.auth.userId de quem realizou a ação (professor dono da
 * turma OU administrador), nunca um id forjado. O registro da
 * notificação em si não distingue quem disparou; a autorização pra
 * ter chegado até aqui já foi resolvida por quem chamou.
 */
async function notifySessionEvent(
  db,
  connection,
  type,
  { sessionId, title, sessionDate, startTime, endTime, courseId, courseName, classId, className, actorUserId }
) {
  const recipients = await resolveActiveStudentsForCourseOrClass(connection, { courseId, classId });

  if (recipients.length === 0) return;

  await createNotificationEvent(db, {
    type,
    sourceType: "class_session",
    sourceId: sessionId,
    actorUserId,
    courseId,
    classId,
    context: { sessionId, sessionTitle: title, sessionDate, startTime, endTime, courseId, courseName, classId, className },
    recipients,
    connection,
  });
}

module.exports = {
  createServiceError,
  ALLOWED_SESSION_TYPES,
  ALLOWED_SESSION_STATUSES,
  mapClassSession,
  validateSessionPayload,
  notifySessionEvent,
};
