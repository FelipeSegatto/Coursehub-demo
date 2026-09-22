const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * Sent by activateContractFromPaidInvoice instead of an activation
 * invitation when the student's account is already 'active' (e.g. an
 * existing student contracting a second course) -- no token is
 * created, they already have a password.
 */
registerNotificationType({
  type: "account.activation.already_active_notice",
  category: "financial",
  priority: "normal",
  emailPolicy: "essential",
  requiredContext: ["userId", "courseName", "invoiceId"],

  buildTitle: () => "Pagamento confirmado",

  buildMessage: (context) =>
    `Pagamento confirmado. Sua nova matrícula em "${context.courseName}" já está disponível.`,

  actionLabel: "Ver meus cursos",

  buildActionPath: () => "/aluno/cursos",

  // Keyed on the invoice whose payment triggered activation -- a
  // repeated/duplicate call to activateContractFromPaidInvoice for
  // the same invoice must never send this notice twice.
  buildDeduplicationKey: (context) =>
    `account.activation.already_active_notice:${context.invoiceId}`,

  recipientPolicy: "the student's own user account (userId)",
});
