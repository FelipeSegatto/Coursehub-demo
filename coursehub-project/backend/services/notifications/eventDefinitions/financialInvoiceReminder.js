const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * Covers both the soft "reminder_3_days_before" and "due_date_notice"
 * collection actions -- both are pre-due-date nudges, same type,
 * context.reminderKind differentiates the copy.
 */
registerNotificationType({
  type: "financial.invoice.reminder",
  category: "financial",
  priority: "normal",
  emailPolicy: "default_on",
  requiredContext: ["collectionActionId", "invoiceId", "invoiceDescription", "reminderKind", "dueDate", "courseId", "courseName"],

  buildTitle: (context) =>
    context.reminderKind === "due_date_notice" ? "Fatura vence hoje" : "Fatura vence em breve",

  buildMessage: (context) => {
    if (context.reminderKind === "due_date_notice") {
      return `A fatura "${context.invoiceDescription}" (${context.courseName}) vence hoje, ${context.dueDate}.`;
    }

    return `A fatura "${context.invoiceDescription}" (${context.courseName}) vence em ${context.dueDate}.`;
  },

  buildActionPath: () => "/aluno/financeiro",

  buildDeduplicationKey: (context) => `financial.invoice.reminder:${context.collectionActionId}`,

  recipientPolicy: "resolveStudentOwner(studentId) via invoice -> financial_contract -> enrollment",
});
