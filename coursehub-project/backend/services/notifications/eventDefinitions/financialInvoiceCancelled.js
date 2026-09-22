const { registerNotificationType } = require("../notificationTypeRegistry");

registerNotificationType({
  type: "financial.invoice.cancelled",
  category: "financial",
  priority: "normal",
  emailPolicy: "default_on",
  requiredContext: ["invoiceId", "invoiceDescription", "courseId", "courseName"],

  buildTitle: () => "Fatura cancelada",

  buildMessage: (context) => {
    const reasonLabel = context.reason ? ` Motivo: "${context.reason}".` : "";

    return `A fatura "${context.invoiceDescription}" (${context.courseName}) foi cancelada.${reasonLabel}`;
  },

  buildActionPath: () => "/aluno/financeiro",

  buildDeduplicationKey: (context) => `financial.invoice.cancelled:${context.invoiceId}`,

  recipientPolicy: "resolveStudentOwner(studentId) via invoice -> financial_contract -> enrollment",
});
