const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * Fired from activateContractService.dispatchAdminEnrollmentNotification,
 * the single point where checkout (payment approved -> invoice paid ->
 * contract activated -> enrollment created/reused) converges,
 * regardless of which of the two call sites (gateway webhook or admin
 * manual payment) triggered it -- one notification per enrollment,
 * never per payment attempt. Only fires when
 * financial_contracts.origin is public_checkout/authenticated_checkout;
 * anything else (admin/migration) fires admin.enrollment.created
 * instead, from the same dispatch function -- never both for the same
 * enrollment.
 */
registerNotificationType({
  type: "admin.checkout.completed",
  category: "enrollment",
  priority: "normal",
  emailPolicy: "default_off",
  requiredContext: ["enrollmentId", "studentId", "studentName", "courseId", "courseName", "origin"],

  buildTitle: () => "Nova matrícula confirmada",

  buildMessage: (context) => `${context.studentName} concluiu o checkout do curso "${context.courseName}".`,

  buildActionPath: (context) =>
    context.contractId ? `/admin/financeiro/contratos/${context.contractId}` : "/admin/matriculas",

  buildDeduplicationKey: (context) => `admin:checkout-completed:${context.enrollmentId}`,

  recipientPolicy: "resolveAllActiveAdmins()",
});
