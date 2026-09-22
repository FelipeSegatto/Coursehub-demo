const { registerNotificationType } = require("../notificationTypeRegistry");

registerNotificationType({
  type: "calendar.event.published",
  category: "calendar",
  priority: "normal",
  emailPolicy: "default_on",
  requiredContext: ["eventId", "eventTitle", "startDate", "scopeType"],

  buildTitle: (context) => `Novo evento no calendário: ${context.eventTitle}`,

  buildMessage: (context) => {
    const rangeLabel =
      context.endDate && context.endDate !== context.startDate
        ? `de ${context.startDate} a ${context.endDate}`
        : `em ${context.startDate}`;

    return `Um novo evento institucional foi publicado: "${context.eventTitle}", ${rangeLabel}.`;
  },

  buildActionPath: (context, role) =>
    role === "teacher" ? "/professor/calendario" : "/aluno/calendario",

  buildDeduplicationKey: (context) => `calendar.event.published:${context.eventId}`,

  recipientPolicy: "resolveCalendarAudience(scopeType, courseId, classId)",
});
