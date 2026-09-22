const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * Fires when an already-scheduled session has its date and/or time
 * changed (the "horário" concept from the master plan) -- title/
 * description/type-only edits don't count. class_id can't change on
 * a session (not part of updateSession's payload), so unlike
 * activities/content there's no separate "scope changed" case here.
 */
registerNotificationType({
  type: "learning.session.changed",
  category: "learning",
  priority: "high",
  emailPolicy: "default_on",
  requiredContext: ["sessionId", "sessionTitle", "sessionDate", "courseId", "courseName", "className"],

  buildTitle: (context) => `Encontro remarcado: ${context.sessionTitle}`,

  buildMessage: (context) => {
    const timeLabel = context.startTime ? ` às ${context.startTime.slice(0, 5)}` : "";

    return `O encontro "${context.sessionTitle}" da turma ${context.className} (${context.courseName}) foi remarcado para ${context.sessionDate}${timeLabel}.`;
  },

  buildActionPath: () => "/aluno/calendario",

  buildDeduplicationKey: (context) =>
    `learning.session.changed:${context.sessionId}:${context.sessionDate}:${context.startTime || "none"}:${context.endTime || "none"}`,

  recipientPolicy: "resolveActiveStudentsForCourseOrClass(courseId, classId)",
});
