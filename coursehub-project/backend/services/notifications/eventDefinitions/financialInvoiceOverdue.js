const { registerNotificationType } = require("../notificationTypeRegistry");

registerNotificationType({
  type: "financial.invoice.overdue",
  category: "financial",
  priority: "high",
  emailPolicy: "default_on",
  requiredContext: ["invoiceId", "invoiceDescription", "dueDate", "courseId", "courseName"],

  buildTitle: () => "Fatura vencida",

  buildMessage: (context) =>
    `A fatura "${context.invoiceDescription}" (${context.courseName}) venceu em ${context.dueDate} e ainda não foi paga.`,

  buildActionPath: () => "/aluno/financeiro",

  // marked_overdue only ever fires the transition once (guarded by
  // UPDATE ... WHERE status IN ('pending','processing') before this
  // notify call), so the invoice id alone is enough to key it.
  buildDeduplicationKey: (context) => `financial.invoice.overdue:${context.invoiceId}`,

  recipientPolicy: "resolveStudentOwner(studentId) via invoice -> financial_contract -> enrollment",
});
