const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * Admin counterpart of financial.invoice.overdue -- fired from the
 * same 'marked_overdue' collection-action branch
 * (invoiceCollectionActionService.js), only when the invoice actually
 * transitions to 'overdue' (never when it was already overdue through
 * another path). Own type/dedup key, so it never collides with or
 * substitutes the student-facing notification.
 */
registerNotificationType({
  type: "admin.financial.invoice.overdue",
  category: "financial",
  priority: "normal",
  emailPolicy: "default_off",
  requiredContext: ["invoiceId", "studentId", "studentName", "courseName", "amount"],

  buildTitle: () => "Fatura em atraso",

  buildMessage: (context) => {
    const amountText = Number.isFinite(Number(context.amount)) ? `R$ ${Number(context.amount).toFixed(2)}` : context.amount;

    return `${context.studentName} possui uma cobrança vencida de ${amountText}.`;
  },

  buildActionPath: () => "/admin/financeiro/cobrancas",

  buildDeduplicationKey: (context) => `admin:invoice-overdue:${context.invoiceId}`,

  recipientPolicy: "resolveAllActiveAdmins()",
});
