const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * Notifies the teacher (never the student) that a submission was
 * confirmed. Per the master plan: "submissão confirmada notifica o
 * professor responsável; rollback não notifica" -- since this fires
 * inside submitActivityAnswers' own transaction, a rollback (e.g. a
 * later validation failure) takes the notification down with it,
 * automatically.
 */
registerNotificationType({
  type: "learning.submission.received",
  category: "learning",
  priority: "normal",
  emailPolicy: "default_on",
  requiredContext: ["submissionId", "activityId", "activityTitle", "activityKind", "studentName", "courseId", "courseName"],

  buildTitle: (context) => {
    const kindLabel = context.activityKind === "exam" ? "Avaliação" : "Atividade";

    return `${kindLabel} recebida: ${context.activityTitle}`;
  },

  buildMessage: (context) => {
    const kindLabel = context.activityKind === "exam" ? "avaliação" : "atividade";

    return `${context.studentName} enviou a ${kindLabel} "${context.activityTitle}" do curso ${context.courseName}. Está pendente de correção.`;
  },

  buildActionPath: (context) => `/professor/envios/${context.submissionId}/corrigir`,

  // Each submission can only be confirmed once (uk_submission_student_activity
  // + the explicit "already submitted" check in submitActivityAnswers), so
  // the submission id alone is enough to keep this idempotent.
  buildDeduplicationKey: (context) => `learning.submission.received:${context.submissionId}`,

  recipientPolicy: "resolveTeachersForCourse(courseId)",
});
