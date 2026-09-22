const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * A class_session has no draft state (ALLOWED_SESSION_STATUSES is
 * scheduled/completed/cancelled) -- creating one already is the
 * "publish" moment, so this fires on every createSession call that
 * results in status 'scheduled' (the default and by far the common
 * case). Sessions never target "the whole course" like activities/
 * content can -- class_id is always a single real class.
 */
registerNotificationType({
  type: "learning.session.scheduled",
  category: "learning",
  priority: "normal",
  emailPolicy: "default_on",
  requiredContext: ["sessionId", "sessionTitle", "sessionDate", "courseId", "courseName", "className"],

  buildTitle: (context) => `Novo encontro: ${context.sessionTitle}`,

  buildMessage: (context) => {
    const timeLabel = context.startTime ? ` às ${context.startTime.slice(0, 5)}` : "";

    return `Um novo encontro foi agendado para a turma ${context.className} do curso ${context.courseName}: "${context.sessionTitle}", em ${context.sessionDate}${timeLabel}.`;
  },

  buildActionPath: () => "/aluno/calendario",

  buildDeduplicationKey: (context) => `learning.session.scheduled:${context.sessionId}`,

  recipientPolicy: "resolveActiveStudentsForCourseOrClass(courseId, classId)",
});
