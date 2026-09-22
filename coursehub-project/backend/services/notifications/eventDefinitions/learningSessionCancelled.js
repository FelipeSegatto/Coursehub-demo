const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * Fires when a previously-scheduled session is cancelled (via the
 * dedicated cancelSession endpoint or a status="cancelled" edit
 * through updateSession's general form -- both paths notify, same
 * as learning.activity.cancelled). Cancelling a session that was
 * already cancelled/completed does not re-fire.
 */
registerNotificationType({
  type: "learning.session.cancelled",
  category: "learning",
  priority: "high",
  emailPolicy: "default_on",
  requiredContext: ["sessionId", "sessionTitle", "sessionDate", "courseId", "courseName", "className"],

  buildTitle: (context) => `Encontro cancelado: ${context.sessionTitle}`,

  buildMessage: (context) =>
    `O encontro "${context.sessionTitle}" da turma ${context.className} (${context.courseName}), previsto para ${context.sessionDate}, foi cancelado.`,

  buildActionPath: () => "/aluno/calendario",

  buildDeduplicationKey: (context) => `learning.session.cancelled:${context.sessionId}`,

  recipientPolicy: "resolveActiveStudentsForCourseOrClass(courseId, classId)",
});
