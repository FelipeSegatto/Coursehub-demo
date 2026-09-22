const {
  renderBaseLayout,
  renderTransactionalBody,
  resolveActionUrl,
} = require("./baseLayout");

/**
 * Password recovery is not a notification-outbox event (it predates
 * the registry and must keep working even if the worker is down).
 * It still uses the same CourseHub HTML shell as every other
 * transactional e-mail so the family stays visually consistent.
 */
function buildPasswordResetEmail({ resetUrl }) {
  const actionUrl = resolveActionUrl(resetUrl);
  const title = "Redefinição de senha";
  const message = [
    "Recebemos uma solicitação para redefinir sua senha.",
    "O link abaixo vale por 15 minutos.",
    "",
    "Se você não pediu isso, ignore este e-mail.",
  ].join("\n");

  const text = [
    title,
    "",
    message,
    "",
    `Acesse: ${actionUrl}`,
  ].join("\n");

  const bodyHtml = renderTransactionalBody({
    title,
    message,
    actionUrl,
    actionLabel: "Redefinir senha",
    notice: "",
  });

  return {
    subject: "Redefinição de senha — CourseHub",
    text,
    html: renderBaseLayout({ preheader: "Redefina sua senha no CourseHub.", bodyHtml }),
  };
}

module.exports = { buildPasswordResetEmail };
