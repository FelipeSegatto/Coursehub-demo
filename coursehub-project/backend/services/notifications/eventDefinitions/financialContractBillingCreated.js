const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * Sent right after a contract + its first invoice are created (see
 * createStudentContractWithInitialInvoice). Goes to the contracting
 * party -- which may be the student themselves (a normal internal
 * recipient) or a third party with no CourseHub account at all (an
 * external recipient, see notificationService.js). It never
 * activates anything -- activation only happens once this invoice is
 * actually paid (financial.contract.activated).
 */
registerNotificationType({
  type: "financial.contract.billing_created",
  category: "financial",
  priority: "normal",
  emailPolicy: "essential",
  requiredContext: [
    "contractId",
    "invoiceId",
    "studentName",
    "courseName",
    "planName",
    "amount",
    "dueDate",
  ],

  buildTitle: () => "Nova cobrança gerada",

  buildMessage: (context) =>
    [
      `Uma nova cobrança foi gerada para ${context.studentName} no curso "${context.courseName}".`,
      `Plano: ${context.planName}`,
      `Valor: R$ ${context.amount}`,
      `Vencimento: ${context.dueDate}`,
      "",
      "A matrícula será liberada automaticamente assim que o pagamento for confirmado.",
    ].join("\n"),

  // O contratante interno (tem conta CourseHub) acessa sua própria
  // área financeira normalmente. Já o contratante externo (sem
  // conta -- ver contracting_parties.user_id nullable) não consegue
  // logar ali: para ele, context.externalPaymentPath traz o link
  // privado e seguro de pagamento daquela invoice específica
  // (/pagamento/fatura?token=..., gerado por
  // contractCreationService.js junto com a criação/reenvio da
  // cobrança). `role` só vem preenchido para destinatário interno
  // (ver notificationService.js#createNotificationEvent) -- é isso
  // que decide o branch, não um campo à parte no contexto.
  actionLabel: "Pagar cobrança",

  buildActionPath: (context, role) => (role ? "/aluno/financeiro" : context.externalPaymentPath || "/aluno/financeiro"),

  // externalPaymentPath embute um token de pagamento de uso -- ver
  // notificationTypeRegistry.js#sensitiveActionPath: o worker de
  // e-mail apaga notification_recipients.action_path do destinatário
  // externo assim que a entrega é confirmada, então o valor bruto não
  // fica em repouso na tabela depois de enviado.
  sensitiveActionPath: true,

  // A manual "reenviar cobrança" action passes a fresh resendToken so
  // each explicit resend creates a genuinely new notification+delivery
  // instead of being silently deduplicated against the original
  // creation event (which is keyed on invoiceId alone, on purpose --
  // creation itself must stay idempotent per invoice).
  buildDeduplicationKey: (context) =>
    context.resendToken
      ? `financial.contract.billing_created:${context.invoiceId}:resend:${context.resendToken}`
      : `financial.contract.billing_created:${context.invoiceId}`,

  recipientPolicy:
    "contracting party of the contract -- internal user when it has an account, external (name+email only) otherwise",
});
