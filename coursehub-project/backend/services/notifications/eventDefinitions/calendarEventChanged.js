const { registerNotificationType } = require("../notificationTypeRegistry");

registerNotificationType({
  type: "calendar.event.changed",
  category: "calendar",
  priority: "normal",
  emailPolicy: "default_on",
  requiredContext: ["eventId", "eventTitle", "startDate", "scopeType"],

  buildTitle: (context) => `Evento do calendário alterado: ${context.eventTitle}`,

  buildMessage: (context) => {
    const rangeLabel =
      context.endDate && context.endDate !== context.startDate
        ? `de ${context.startDate} a ${context.endDate}`
        : `em ${context.startDate}`;

    return `O evento institucional "${context.eventTitle}" foi alterado. Novas datas: ${rangeLabel}.`;
  },

  buildActionPath: (context, role) =>
    role === "teacher" ? "/professor/calendario" : "/aluno/calendario",

  // A given (eventId, startDate, endDate) combination only fires once
  // -- a further edit that lands on a genuinely different date range
  // is a new event, re-saving the identical range is not.
  buildDeduplicationKey: (context) =>
    `calendar.event.changed:${context.eventId}:${context.startDate}:${context.endDate ?? "none"}`,

  recipientPolicy: "resolveCalendarAudience(scopeType, courseId, classId)",
});
