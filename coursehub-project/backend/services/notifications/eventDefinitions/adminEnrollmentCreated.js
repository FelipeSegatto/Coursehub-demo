const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * Covers active enrollments created OUTSIDE checkout: the admin
 * "matrícula-primeiro" wizard (adminEnrollmentService.createEnrollment),
 * scholarship/courtesy enrollments and imported/migrated enrollments
 * (adminManualEnrollmentService.js), and admin-registered external
 * payments (which do converge on activateContractFromPaidInvoice, but
 * with financial_contracts.origin='admin', not a checkout origin --
 * see admin.checkout.completed and
 * activateContractService.dispatchAdminEnrollmentNotification for the
 * origin-based branch that picks exactly one of the two types per
 * enrollment).
 */
registerNotificationType({
  type: "admin.enrollment.created",
  category: "enrollment",
  priority: "normal",
  emailPolicy: "default_off",
  requiredContext: ["enrollmentId", "studentId", "studentName", "courseId", "courseName", "origin"],

  buildTitle: () => "Matrícula registrada",

  buildMessage: (context) => `Uma matrícula foi registrada manualmente para ${context.studentName} no curso "${context.courseName}".`,

  buildActionPath: (context) =>
    context.contractId ? `/admin/financeiro/contratos/${context.contractId}` : "/admin/matriculas",

  buildDeduplicationKey: (context) => `admin:enrollment-created:${context.enrollmentId}`,

  recipientPolicy: "resolveAllActiveAdmins()",
});
