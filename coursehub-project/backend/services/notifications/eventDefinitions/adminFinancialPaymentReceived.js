const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * Admin counterpart of financial.payment.approved -- the student is
 * already told their invoice was paid; admins need the same fact as
 * an operational "recebemos este pagamento" signal (demo PIX
 * auto-approve included). Own type/dedup key so it never collides
 * with or substitutes the student-facing notification.
 */
registerNotificationType({
  type: "admin.financial.payment.received",
  category: "financial",
  priority: "normal",
  emailPolicy: "default_off",
  requiredContext: ["paymentId", "invoiceId", "studentId", "studentName", "courseName", "amount"],

  buildTitle: () => "Pagamento recebido",

  buildMessage: (context) => {
    const amountText = Number.isFinite(Number(context.amount))
      ? `R$ ${Number(context.amount).toFixed(2)}`
      : context.amount;
    const method = context.paymentMethod ? ` via ${context.paymentMethod}` : "";

    return `${context.studentName} pagou ${amountText}${method} (${context.courseName}).`;
  },

  buildActionPath: (context) =>
    context.contractId ? `/admin/financeiro/contratos/${context.contractId}` : "/admin/financeiro",

  buildDeduplicationKey: (context) => `admin:payment-received:${context.paymentId}`,

  recipientPolicy: "resolveAllActiveAdmins()",
});
