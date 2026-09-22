const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * Only ever fires when ENABLE_ENROLLMENT_AUTO_LOCK=true actually
 * performs the lock -- see invoiceCollectionActionService.js. With
 * the switch off (the default), enrollment_locked_30_days is marked
 * 'skipped' and this type never fires.
 */
registerNotificationType({
  type: "financial.enrollment.locked",
  category: "financial",
  priority: "urgent",
  emailPolicy: "essential",
  requiredContext: ["invoiceId", "invoiceDescription", "dueDate", "courseId", "courseName"],

  buildTitle: () => "Matrícula bloqueada por atraso no pagamento",

  buildMessage: (context) =>
    `Sua matrícula em ${context.courseName} foi bloqueada por falta de pagamento da fatura "${context.invoiceDescription}", vencida em ${context.dueDate}. Regularize o pagamento para reativar o acesso.`,

  buildActionPath: () => "/aluno/financeiro",

  buildDeduplicationKey: (context) => `financial.enrollment.locked:${context.invoiceId}`,

  recipientPolicy: "resolveStudentOwner(studentId) via invoice -> financial_contract -> enrollment",
});
