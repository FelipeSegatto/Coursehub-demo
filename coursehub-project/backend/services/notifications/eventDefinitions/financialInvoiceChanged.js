const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * Covers both call sites that alter an open invoice --
 * changeInvoiceDueDate and changeInvoiceAmount -- as a single type,
 * same spirit as learning.activity.changed. Both services already
 * reject a no-op write (new value identical to current), so every
 * call that reaches here is a genuine change.
 */
registerNotificationType({
  type: "financial.invoice.changed",
  category: "financial",
  priority: "normal",
  emailPolicy: "default_on",
  requiredContext: [
    "invoiceId",
    "invoiceDescription",
    "changeType",
    "previousValue",
    "newValue",
    "courseId",
    "courseName",
  ],

  buildTitle: () => "Alteração em uma fatura",

  buildMessage: (context) => {
    if (context.changeType === "due_date") {
      return `A data de vencimento da fatura "${context.invoiceDescription}" (${context.courseName}) foi alterada de ${context.previousValue} para ${context.newValue}.`;
    }

    return `O valor da fatura "${context.invoiceDescription}" (${context.courseName}) foi alterado de R$ ${context.previousValue} para R$ ${context.newValue}.`;
  },

  buildActionPath: () => "/aluno/financeiro",

  buildDeduplicationKey: (context) =>
    `financial.invoice.changed:${context.invoiceId}:${context.changeType}:${context.newValue}`,

  recipientPolicy: "resolveStudentOwner(studentId) via invoice -> financial_contract -> enrollment",
});
