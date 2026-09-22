const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * Fired from the 'enrollment_locked_30_days' collection-action
 * branch, ALWAYS -- deliberately not gated by
 * ENABLE_ENROLLMENT_AUTO_LOCK. "The invoice reached 30 days overdue"
 * and "the enrollment was auto-locked" are two distinct facts;
 * context.enrollmentWasAutoLocked carries the second one so the UI
 * can show it, but never substitutes for the dedicated
 * financial.enrollment.locked notification (still fired only when the
 * lock actually happens). emailPolicy is "essential" -- the one admin
 * type in this feature guaranteed to email, since a 30-day-overdue
 * invoice is the most urgent financial milestone here.
 */
registerNotificationType({
  type: "admin.financial.invoice.overdue_30_days",
  category: "financial",
  priority: "urgent",
  emailPolicy: "essential",
  requiredContext: ["invoiceId", "studentId", "studentName", "courseName", "amount"],

  buildTitle: () => "Fatura atrasada há 30 dias",

  buildMessage: (context) => {
    const amountText = Number.isFinite(Number(context.amount)) ? `R$ ${Number(context.amount).toFixed(2)}` : context.amount;
    const lockText = context.enrollmentWasAutoLocked
      ? "A matrícula foi bloqueada automaticamente."
      : "A matrícula NÃO foi bloqueada (bloqueio automático desativado ou já resolvido por outro caminho).";

    return `A fatura de ${context.studentName} (${amountText}, curso "${context.courseName}") atingiu 30 dias de atraso. ${lockText}`;
  },

  buildActionPath: () => "/admin/financeiro/cobrancas",

  buildDeduplicationKey: (context) => `admin:invoice-overdue-30:${context.invoiceId}`,

  recipientPolicy: "resolveAllActiveAdmins()",
});
