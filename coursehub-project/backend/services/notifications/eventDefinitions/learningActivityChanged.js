const { registerNotificationType } = require("../notificationTypeRegistry");
const { formatDateOnly } = require("../../../utils/appConfig");

const ACTIVITY_ACTION_PATH_BY_KIND = {
  exam: (activityId) => `/aluno/avaliacoes/${activityId}`,
  activity: (activityId) => `/aluno/atividades/${activityId}`,
};

/**
 * Operational change to an already-published activity/exam: due
 * date and/or class scope. Editing title/description/questions/score
 * does not go through this type -- teacherActivityService only calls
 * it when it has detected one of those two specific fields actually
 * changed on an activity that was already active before and after
 * the edit (a draft->active transition is `learning.activity.published`
 * instead, never both for the same save).
 */
registerNotificationType({
  type: "learning.activity.changed",
  category: "learning",
  priority: "high",
  emailPolicy: "default_on",
  requiredContext: ["activityId", "activityTitle", "activityKind", "courseId", "courseName"],

  buildTitle: (context) =>
    context.activityKind === "exam"
      ? `Avaliação alterada: ${context.activityTitle}`
      : `Atividade alterada: ${context.activityTitle}`,

  buildMessage: (context) => {
    const kindLabel = context.activityKind === "exam" ? "avaliação" : "atividade";
    const dueDateLabel = context.dueDate
      ? `O novo prazo é ${formatDateOnly(context.dueDate)}.`
      : "O prazo foi removido.";

    return `A ${kindLabel} "${context.activityTitle}" do curso ${context.courseName} teve prazo ou turma alterados. ${dueDateLabel}`;
  },

  buildActionPath: (context) =>
    (ACTIVITY_ACTION_PATH_BY_KIND[context.activityKind] || ACTIVITY_ACTION_PATH_BY_KIND.activity)(
      context.activityId
    ),

  // Includes the new due date/class in the key: retrying the exact
  // same edit dedupes, but a genuinely different subsequent change
  // (even to the same activity) is a new event, per the "operational
  // changes create new events" rule.
  buildDeduplicationKey: (context) =>
    `learning.activity.changed:${context.activityId}:${context.dueDate || "none"}:${context.classId ?? "course"}`,

  recipientPolicy: "resolveActiveStudentsForCourseOrClass(courseId, classId) -- post-change scope",
});
