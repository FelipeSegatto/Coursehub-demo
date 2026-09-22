const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * "Presença normal não gera ruído; ausência, atraso e correção
 * relevante notificam." A single type covers both the initial flag
 * (attendance first recorded as absent/late) and a later correction
 * -- teacher re-registering the same session, or an admin
 * adjustment -- whenever the correction moves the status into or out
 * of the notify-worthy set (absent/late). A correction that never
 * touches absent/late on either side (e.g. present -> excused) stays
 * silent, same as a first-time "present" does.
 */
registerNotificationType({
  type: "learning.attendance.flagged",
  category: "learning",
  priority: "normal",
  emailPolicy: "default_on",
  requiredContext: [
    "sessionId",
    "studentId",
    "sessionTitle",
    "sessionDate",
    "courseId",
    "courseName",
    "className",
    "status",
  ],

  buildTitle: (context) =>
    context.isCorrection ? "Frequência corrigida" : "Frequência registrada",

  buildMessage: (context) => {
    const statusLabel = {
      absent: "ausente",
      late: "atrasado(a)",
      present: "presente",
      excused: "falta justificada",
    }[context.status] || context.status;

    const reasonLabel = context.reason ? ` Motivo: "${context.reason}".` : "";

    if (context.isCorrection) {
      return `Sua frequência no encontro "${context.sessionTitle}" (${context.className}, ${context.courseName}) em ${context.sessionDate} foi corrigida para: ${statusLabel}.${reasonLabel}`;
    }

    return `Você foi marcado(a) como ${statusLabel} no encontro "${context.sessionTitle}" (${context.className}, ${context.courseName}) em ${context.sessionDate}.`;
  },

  buildActionPath: () => "/aluno/progresso",

  // sessionId+status+previousStatus: a repeated correction landing on
  // a genuinely different combination is a new event; saving the
  // identical status twice in a row (no-op re-submit) dedupes away.
  buildDeduplicationKey: (context) =>
    `learning.attendance.flagged:${context.sessionId}:${context.studentId}:${context.status}:${context.previousStatus ?? "none"}`,

  recipientPolicy: "resolveStudentOwner(studentId)",
});
