const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * Fired from paymentProcessingService.applyTerminalNonApproval, ONLY
 * when the real, first transition to 'rejected' happens (guarded
 * upstream by payment_events.gateway_event_id uniqueness and the
 * row.status === targetStatus no-op -- a retried/duplicate webhook
 * delivery never reaches this call twice). 'cancelled' (the student
 * abandoning their own attempt) never fires this -- only a genuine
 * gateway rejection does.
 */
registerNotificationType({
  type: "admin.payment.rejected",
  category: "financial",
  priority: "high",
  emailPolicy: "default_off",
  requiredContext: ["paymentId", "invoiceId", "studentId", "studentName", "courseName", "amount"],

  buildTitle: () => "Pagamento rejeitado",

  buildMessage: (context) => {
    const amountText = Number.isFinite(Number(context.amount)) ? `R$ ${Number(context.amount).toFixed(2)}` : context.amount;
    const lines = [`O pagamento de ${context.studentName} (${amountText}, curso "${context.courseName}") foi rejeitado pelo gateway.`];

    if (context.rejectionReason) {
      lines.push(`Motivo: ${context.rejectionReason}`);
    }

    return lines.join(" ");
  },

  buildActionPath: (context) =>
    context.contractId ? `/admin/financeiro/contratos/${context.contractId}` : "/admin/financeiro",

  buildDeduplicationKey: (context) => `admin:payment-rejected:${context.paymentId}`,

  recipientPolicy: "resolveAllActiveAdmins()",
});
