const { registerNotificationType } = require("../notificationTypeRegistry");

registerNotificationType({
  type: "financial.enrollment.lock_warning",
  category: "financial",
  priority: "urgent",
  emailPolicy: "essential",
  requiredContext: ["invoiceId", "invoiceDescription", "dueDate", "courseId", "courseName"],

  buildTitle: () => "Risco de bloqueio da matrícula",

  buildMessage: (context) =>
    `A fatura "${context.invoiceDescription}" (${context.courseName}), vencida em ${context.dueDate}, segue em aberto. Sua matrícula pode ser bloqueada em 15 dias se o pagamento não for regularizado.`,

  buildActionPath: () => "/aluno/financeiro",

  buildDeduplicationKey: (context) => `financial.enrollment.lock_warning:${context.invoiceId}`,

  recipientPolicy: "resolveStudentOwner(studentId) via invoice -> financial_contract -> enrollment",
});
