const { registerNotificationType } = require("../notificationTypeRegistry");

registerNotificationType({
  type: "financial.payment.refunded",
  category: "financial",
  priority: "normal",
  emailPolicy: "default_on",
  requiredContext: ["paymentId", "invoiceId", "invoiceDescription", "amount", "courseId", "courseName"],

  buildTitle: () => "Pagamento reembolsado",

  buildMessage: (context) => {
    const reasonLabel = context.reason ? ` Motivo: "${context.reason}".` : "";

    return `O pagamento de R$ ${context.amount} referente à fatura "${context.invoiceDescription}" (${context.courseName}) foi reembolsado.${reasonLabel}`;
  },

  buildActionPath: () => "/aluno/financeiro",

  buildDeduplicationKey: (context) => `financial.payment.refunded:${context.paymentId}`,

  recipientPolicy: "resolveStudentOwner(studentId) via invoice -> financial_contract -> enrollment",
});
