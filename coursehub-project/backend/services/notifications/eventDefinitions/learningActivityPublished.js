const { registerNotificationType } = require("../notificationTypeRegistry");
const { formatDateOnly } = require("../../../utils/appConfig");

const ACTIVITY_ACTION_PATH_BY_KIND = {
  exam: (activityId) => `/aluno/avaliacoes/${activityId}`,
  activity: (activityId) => `/aluno/atividades/${activityId}`,
};

/**
 * First real business event in the registry. Fires once when a
 * teacher publishes an activity/exam (create as active, or a
 * draft -> active transition) -- never on draft creation, never
 * again on ordinary edits. The caller (teacherActivityService) is
 * responsible for only invoking createNotificationEvent when it has
 * actually detected that transition; this definition itself has no
 * opinion on when it fires, only on what the notification says once
 * it does.
 */
registerNotificationType({
  type: "learning.activity.published",
  category: "learning",
  priority: "normal",
  emailPolicy: "default_on",
  requiredContext: ["activityId", "activityTitle", "activityKind", "courseId", "courseName"],

  buildTitle: (context) =>
    context.activityKind === "exam"
      ? `Nova avaliação: ${context.activityTitle}`
      : `Nova atividade: ${context.activityTitle}`,

  buildMessage: (context) => {
    const kindLabel = context.activityKind === "exam" ? "avaliação" : "atividade";
    const dueDateLabel = context.dueDate ? ` Prazo: ${formatDateOnly(context.dueDate)}.` : "";

    return `Uma nova ${kindLabel} foi publicada no curso ${context.courseName}: "${context.activityTitle}".${dueDateLabel}`;
  },

  buildActionPath: (context) =>
    (ACTIVITY_ACTION_PATH_BY_KIND[context.activityKind] || ACTIVITY_ACTION_PATH_BY_KIND.activity)(
      context.activityId
    ),

  buildDeduplicationKey: (context) => `learning.activity.published:${context.activityId}`,

  recipientPolicy: "resolveActiveStudentsForCourseOrClass(courseId, classId)",
});
