const { registerNotificationType } = require("../notificationTypeRegistry");

registerNotificationType({
  type: "calendar.event.cancelled",
  category: "calendar",
  priority: "normal",
  emailPolicy: "default_on",
  requiredContext: ["eventId", "eventTitle", "startDate", "scopeType"],

  buildTitle: (context) => `Evento do calendário cancelado: ${context.eventTitle}`,

  buildMessage: (context) =>
    `O evento institucional "${context.eventTitle}", previsto para ${context.startDate}, foi cancelado.`,

  buildActionPath: (context, role) =>
    role === "teacher" ? "/professor/calendario" : "/aluno/calendario",

  buildDeduplicationKey: (context) => `calendar.event.cancelled:${context.eventId}`,

  recipientPolicy: "resolveCalendarAudience(scopeType, courseId, classId)",
});
