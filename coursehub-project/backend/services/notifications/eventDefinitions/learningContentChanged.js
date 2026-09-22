const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * Operational change (due date or class scope) to an already-active
 * content item -- mirrors learning.activity.changed.
 */
registerNotificationType({
  type: "learning.content.changed",
  category: "learning",
  priority: "high",
  emailPolicy: "default_on",
  requiredContext: ["contentId", "contentTitle", "contentType", "courseId", "courseName"],

  buildTitle: (context) => `Conteúdo alterado: ${context.contentTitle}`,

  buildMessage: (context) => {
    const dueDateLabel = context.dueDate
      ? `O novo prazo é ${context.dueDate.toString().slice(0, 10)}.`
      : "O prazo foi removido.";

    return `O conteúdo "${context.contentTitle}" do curso ${context.courseName} teve prazo ou turma alterados. ${dueDateLabel}`;
  },

  buildActionPath: (context) => `/aluno/dashboard-aluno/courses/${context.courseId}`,

  buildDeduplicationKey: (context) =>
    `learning.content.changed:${context.contentId}:${context.dueDate || "none"}:${context.classId ?? "course"}`,

  recipientPolicy: "resolveActiveStudentsForCourseOrClass(courseId, classId) -- post-change scope",
});
