const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * Notifies only the student who owns the grade -- never the whole
 * class. Fires from three call sites (teacher's per-question
 * correction, teacher's quick score override, admin's adjustment),
 * all gated by the same rule: only when this is the first grade for
 * the submission, or the score/feedback actually differ from what
 * was there before. Re-saving the identical value must never notify
 * again.
 */
registerNotificationType({
  type: "learning.grade.published",
  category: "learning",
  priority: "normal",
  emailPolicy: "default_on",
  requiredContext: [
    "submissionId",
    "activityId",
    "activityTitle",
    "activityKind",
    "score",
    "maxScore",
    "courseId",
    "courseName",
  ],

  buildTitle: (context) => `Nota publicada: ${context.activityTitle}`,

  buildMessage: (context) => {
    const kindLabel = context.activityKind === "exam" ? "avaliação" : "atividade";
    const feedbackLabel = context.feedback ? ` Feedback: "${context.feedback}"` : "";

    return `Sua nota da ${kindLabel} "${context.activityTitle}" (${context.courseName}) foi publicada: ${context.score}/${context.maxScore}.${feedbackLabel}`;
  },

  buildActionPath: () => "/aluno/notas",

  // submissionId anchors "which grade", score+feedback anchor "which
  // version of it" -- identical re-save dedupes, a genuine change
  // (even reverting back to an earlier value) is a new event.
  buildDeduplicationKey: (context) =>
    `learning.grade.published:${context.submissionId}:${context.score}:${(context.feedback || "").slice(0, 80)}`,

  recipientPolicy: "resolveStudentOwner(studentId)",
});
