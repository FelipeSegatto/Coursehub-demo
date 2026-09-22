const { registerNotificationType } = require("../notificationTypeRegistry");

const CONTENT_TYPE_LABEL = {
  video: "vídeo",
  pdf: "PDF",
  text: "texto",
  live_class: "aula ao vivo",
};

/**
 * Mirrors learning.activity.published for course_contents. There is
 * no per-content deep link in the student app today (content is
 * viewed inside the course dashboard, not its own route), so
 * actionPath points at the course-level content view -- confirmed in
 * Router.jsx: "/aluno/dashboard-aluno/courses/:id" is the only
 * student-facing content route.
 */
registerNotificationType({
  type: "learning.content.published",
  category: "learning",
  priority: "normal",
  emailPolicy: "default_on",
  requiredContext: ["contentId", "contentTitle", "contentType", "courseId", "courseName"],

  buildTitle: (context) => `Novo conteúdo: ${context.contentTitle}`,

  buildMessage: (context) => {
    const typeLabel = CONTENT_TYPE_LABEL[context.contentType] || "conteúdo";
    const dueDateLabel = context.dueDate ? ` Prazo: ${context.dueDate.toString().slice(0, 10)}.` : "";

    return `Um novo ${typeLabel} foi publicado no curso ${context.courseName}: "${context.contentTitle}".${dueDateLabel}`;
  },

  buildActionPath: (context) => `/aluno/dashboard-aluno/courses/${context.courseId}`,

  buildDeduplicationKey: (context) => `learning.content.published:${context.contentId}`,

  recipientPolicy: "resolveActiveStudentsForCourseOrClass(courseId, classId)",
});
