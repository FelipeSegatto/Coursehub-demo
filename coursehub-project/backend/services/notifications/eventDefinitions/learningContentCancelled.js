const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * Fires when a previously-active content item is archived -- mirrors
 * learning.activity.cancelled. Archiving something that was already
 * draft (never visible to students) does not fire this.
 */
registerNotificationType({
  type: "learning.content.cancelled",
  category: "learning",
  priority: "high",
  emailPolicy: "default_on",
  requiredContext: ["contentId", "contentTitle", "contentType", "courseId", "courseName"],

  buildTitle: (context) => `Conteúdo removido: ${context.contentTitle}`,

  buildMessage: (context) =>
    `O conteúdo "${context.contentTitle}" do curso ${context.courseName} foi removido pelo professor.`,

  buildActionPath: (context) => `/aluno/dashboard-aluno/courses/${context.courseId}`,

  buildDeduplicationKey: (context) => `learning.content.cancelled:${context.contentId}`,

  recipientPolicy: "resolveActiveStudentsForCourseOrClass(courseId, classId) -- scope at cancellation time",
});
