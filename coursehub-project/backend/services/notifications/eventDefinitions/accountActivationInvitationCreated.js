const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * Sent only after activateContractFromPaidInvoice confirms payment
 * AND creates the enrollment, and only when the student's account is
 * still 'pending_activation' -- never at contract creation, never
 * before payment. Semantically distinct from password recovery: the
 * link lets the student set their FIRST password, it never contains
 * one. buildActionPath points at the public /ativar-conta page (no
 * auth required, the token itself is the credential).
 */
registerNotificationType({
  type: "account.activation.invitation_created",
  category: "financial",
  priority: "high",
  emailPolicy: "essential",
  requiredContext: ["userId", "studentName", "courseName", "activationToken"],

  buildTitle: () => "Seu acesso ao CourseHub está disponível",

  buildMessage: (context) =>
    [
      `Olá, ${context.studentName}!`,
      `Seu pagamento foi confirmado e sua matrícula em "${context.courseName}" já está disponível.`,
      "Crie uma senha para acessar o CourseHub pelo link abaixo.",
      "",
      "Se você não reconhece esta ação, ignore este e-mail.",
    ].join("\n"),

  actionLabel: "Criar senha",

  buildActionPath: (context) => `/ativar-conta?token=${context.activationToken}`,

  // One invitation per issued token -- a resend/manual-link generation
  // always issues a NEW token (see accountActivationService), so this
  // never collides with a previous invitation for the same user.
  buildDeduplicationKey: (context) => `account.activation.invitation_created:${context.activationToken}`,

  recipientPolicy: "the student's own user account (userId)",
});
