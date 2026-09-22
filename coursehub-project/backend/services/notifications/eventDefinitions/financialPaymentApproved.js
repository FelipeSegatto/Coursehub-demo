const { registerNotificationType } = require("../notificationTypeRegistry");

registerNotificationType({
  type: "financial.payment.approved",
  category: "financial",
  priority: "normal",
  emailPolicy: "default_on",
  requiredContext: ["paymentId", "invoiceId", "invoiceDescription", "amount", "courseId", "courseName"],

  buildTitle: () => "Pagamento aprovado",

  buildMessage: (context) =>
    `Recebemos o pagamento de R$ ${context.amount} referente à fatura "${context.invoiceDescription}" (${context.courseName}).`,

  buildActionPath: () => "/aluno/financeiro",

  // A given invoice only ever has one approved payment (paymentService
  // rejects a second approval for the same invoice), so the payment
  // id alone is enough to key this uniquely.
  buildDeduplicationKey: (context) => `financial.payment.approved:${context.paymentId}`,

  recipientPolicy: "resolveStudentOwner(studentId) via invoice -> financial_contract -> enrollment",
});
