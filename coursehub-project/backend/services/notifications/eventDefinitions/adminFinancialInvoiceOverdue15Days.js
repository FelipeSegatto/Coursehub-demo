const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * Fired from the 'lock_warning_15_days' collection-action branch,
 * which runs unconditionally (unlike the 30-day/auto-lock branch --
 * there is no flag that suppresses the 15-day warning). context.
 * warningActionExecuted is always true for this type; kept in the
 * context shape for symmetry with the 30-day type's
 * enrollmentWasAutoLocked, and because the spec asked for it
 * explicitly.
 */
registerNotificationType({
  type: "admin.financial.invoice.overdue_15_days",
  category: "financial",
  priority: "high",
  emailPolicy: "default_off",
  requiredContext: ["invoiceId", "studentId", "studentName", "courseName", "amount"],

  buildTitle: () => "Fatura atrasada há 15 dias",

  buildMessage: (context) => {
    const amountText = Number.isFinite(Number(context.amount)) ? `R$ ${Number(context.amount).toFixed(2)}` : context.amount;

    return `A fatura de ${context.studentName} (${amountText}, curso "${context.courseName}") atingiu 15 dias de atraso. O aviso automático de cobrança já foi processado.`;
  },

  buildActionPath: () => "/admin/financeiro/cobrancas",

  buildDeduplicationKey: (context) => `admin:invoice-overdue-15:${context.invoiceId}`,

  recipientPolicy: "resolveAllActiveAdmins()",
});
