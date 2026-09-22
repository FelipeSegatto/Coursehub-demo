const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * Disparado pela ação administrativa "Enviar por e-mail" de
 * invoicePaymentAccessService.js#sendInvoicePaymentLinkByEmail --
 * sempre um novo token/link (o anterior já foi invalidado antes desta
 * notificação ser criada). Destinatário é sempre o contratante da
 * fatura, interno ou externo (mesma política de
 * financial.contract.billing_created).
 */
registerNotificationType({
  type: "financial.invoice.payment_link_shared",
  category: "financial",
  priority: "normal",
  emailPolicy: "essential",
  requiredContext: ["invoiceId", "studentName", "courseName", "amount", "dueDate", "paymentLinkUrl"],

  buildTitle: () => "Link de pagamento disponível",

  buildMessage: (context) =>
    [
      `Segue o link para pagamento da cobrança referente ao curso "${context.courseName}" para ${context.studentName}.`,
      `Valor: R$ ${context.amount}`,
      `Vencimento: ${context.dueDate}`,
      "",
      "Por segurança, não encaminhe este link a outras pessoas.",
    ].join("\n"),

  // O destinatário interno já tem sua própria área financeira; o
  // destinatário externo (sem conta) usa o link privado desta invoice
  // -- mesmo branch de financialContractBillingCreated.js.
  actionLabel: "Pagar cobrança",

  buildActionPath: (context, role) => (role ? "/aluno/financeiro" : context.paymentLinkUrl),

  buildDeduplicationKey: (context) => `financial.invoice.payment_link_shared:${context.invoiceId}:${context.linkToken}`,

  sensitiveActionPath: true,

  recipientPolicy: "contratante da fatura -- interno quando tem conta, externo (nome+e-mail) caso contrário",
});
