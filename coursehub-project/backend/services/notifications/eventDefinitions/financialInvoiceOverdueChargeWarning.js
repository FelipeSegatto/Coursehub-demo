const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * Notification-only -- there is no late-fee/interest field or table
 * anywhere in the schema (confirmed while planning Etapa 5f), so this
 * never actually changes invoices.amount. It's a warning that a real
 * charge may be applied manually by an admin (via the existing
 * changeInvoiceAmount, which already notifies on its own), not an
 * automatic one.
 */
registerNotificationType({
  type: "financial.invoice.overdue_charge_warning",
  category: "financial",
  priority: "high",
  emailPolicy: "default_on",
  requiredContext: ["invoiceId", "invoiceDescription", "dueDate", "courseId", "courseName"],

  buildTitle: () => "Fatura em atraso há mais de 10 dias",

  buildMessage: (context) =>
    `A fatura "${context.invoiceDescription}" (${context.courseName}), vencida em ${context.dueDate}, está em atraso há mais de 10 dias. Um acréscimo pode ser aplicado -- regularize o quanto antes.`,

  buildActionPath: () => "/aluno/financeiro",

  buildDeduplicationKey: (context) => `financial.invoice.overdue_charge_warning:${context.invoiceId}`,

  recipientPolicy: "resolveStudentOwner(studentId) via invoice -> financial_contract -> enrollment",
});
