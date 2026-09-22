const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * Fires when a previously-active activity/exam is deactivated
 * (teacherActivityService.deactivateActivity) -- i.e. students who
 * could see and work on it no longer can. Deactivating something
 * that was already draft/archived (never visible to students) does
 * not fire this -- there's nothing to cancel from their perspective.
 */
registerNotificationType({
  type: "learning.activity.cancelled",
  category: "learning",
  priority: "high",
  emailPolicy: "default_on",
  requiredContext: ["activityId", "activityTitle", "activityKind", "courseId", "courseName"],

  buildTitle: (context) =>
    context.activityKind === "exam"
      ? `Avaliação cancelada: ${context.activityTitle}`
      : `Atividade cancelada: ${context.activityTitle}`,

  buildMessage: (context) => {
    const kindLabel = context.activityKind === "exam" ? "avaliação" : "atividade";

    return `A ${kindLabel} "${context.activityTitle}" do curso ${context.courseName} foi cancelada pelo professor.`;
  },

  // No per-activity deep link once it's cancelled/hidden -- points
  // back to the course's activity list instead.
  buildActionPath: () => "/aluno/atividades",

  buildDeduplicationKey: (context) => `learning.activity.cancelled:${context.activityId}`,

  recipientPolicy: "resolveActiveStudentsForCourseOrClass(courseId, classId) -- scope at cancellation time",
});
