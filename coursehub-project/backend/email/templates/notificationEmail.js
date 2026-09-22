const {
  renderBaseLayout,
  renderTransactionalBody,
  resolveActionUrl,
} = require("./baseLayout");

const PRIORITY_LABELS = {
  normal: null,
  high: "Importante",
  urgent: "Urgente",
};

/**
 * Renders the outbox worker's one and only email shape: title +
 * message (both already built by the notificationTypeRegistry, so
 * they're the intended safe summary, not a raw entity dump) + a link
 * back into the app. `actionPath` is usually an internal path
 * (validated server-side by the registry, e.g. "/aluno/notas/42");
 * absolute URLs (invoice payment links) are kept as-is.
 */
function buildNotificationEmail({ title, message, actionPath, priority, actionLabel }) {
  const actionUrl = resolveActionUrl(actionPath);
  const priorityLabel = PRIORITY_LABELS[priority] || null;
  const buttonLabel = actionLabel || "Acessar no CourseHub";

  const subject = priorityLabel ? `[${priorityLabel}] ${title}` : title;

  const text = [
    title,
    "",
    message,
    "",
    `Acesse: ${actionUrl}`,
    "",
    "Canal institucional do CourseHub -- esta comunicação pode ser acessada pela gestão autorizada para atendimento, segurança e auditoria.",
  ].join("\n");

  const bodyHtml = renderTransactionalBody({
    title,
    message,
    actionUrl,
    actionLabel: buttonLabel,
  });

  const html = renderBaseLayout({ preheader: message, bodyHtml });

  return { subject, text, html };
}

module.exports = { buildNotificationEmail };
