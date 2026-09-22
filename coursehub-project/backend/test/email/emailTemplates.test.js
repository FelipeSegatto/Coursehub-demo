const { test } = require("node:test");
const assert = require("node:assert/strict");

const { buildNotificationEmail } = require("../../email/templates/notificationEmail");
const { buildPasswordResetEmail } = require("../../email/templates/passwordResetEmail");
const { resolveActionUrl, frontendOrigin } = require("../../email/templates/baseLayout");

require("../../services/notifications/eventDefinitions");
const { getNotificationType } = require("../../services/notifications/notificationTypeRegistry");

test("notification and password-reset emails share the CourseHub letterhead", () => {
  const notification = buildNotificationEmail({
    title: 'Title <script>alert("x")</script>',
    message: "Line one\n<b>bold</b> & unsafe",
    actionPath: "/aluno/notas",
    priority: "urgent",
  });
  const reset = buildPasswordResetEmail({
    resetUrl: "http://localhost:5173/redefinir-senha?token=smoke",
  });

  for (const html of [notification.html, reset.html]) {
    assert.ok(html.includes("#0a2a57"));
    assert.ok(html.includes("#f46c3c"));
    assert.ok(html.includes("Course"));
    assert.ok(html.includes("Hub"));
    assert.ok(html.includes("e-mail automático do CourseHub"));
  }

  assert.ok(!notification.html.includes("<script>alert"));
  assert.ok(notification.html.includes("&lt;script&gt;"));
  assert.ok(notification.subject.startsWith("[Urgente]"));
  assert.equal(reset.subject, "Redefinição de senha — CourseHub");
  assert.ok(reset.html.includes("Redefinir senha"));
});

test("resolveActionUrl does not prefix FRONTEND_URL onto absolute payment links", () => {
  const absolute = "http://localhost:5173/pagamento/fatura?token=abc";
  const { html, text } = buildNotificationEmail({
    title: "Link de pagamento disponível",
    message: "Pague a cobrança",
    actionPath: absolute,
    priority: "normal",
    actionLabel: "Pagar cobrança",
  });

  assert.equal(resolveActionUrl(absolute), absolute);
  assert.equal(resolveActionUrl("/aluno/financeiro"), `${frontendOrigin()}/aluno/financeiro`);
  assert.ok(html.includes(`href="${absolute}"`));
  assert.ok(!html.includes("http://localhost:5173http://"));
  assert.ok(html.includes("Pagar cobrança"));
  assert.ok(text.includes(absolute));
});

test("document-ready notifications send students to the matching area", () => {
  const definition = getNotificationType("financial.document.ready");

  assert.equal(definition.actionLabel, "Baixar documento");
  assert.equal(
    definition.buildActionPath({ documentType: "certificate" }),
    "/aluno/documentos"
  );
  assert.equal(
    definition.buildActionPath({ documentType: "enrollment_declaration" }),
    "/aluno/documentos"
  );
  assert.equal(
    definition.buildActionPath({ documentType: "financial_contract" }),
    "/aluno/financeiro"
  );
  assert.match(
    definition.buildMessage({ documentType: "certificate" }),
    /área de documentos/
  );
});
