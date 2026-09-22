/**
 * Side-effect-only module: requiring it registers every notification
 * type in notificationTypeRegistry.js. Required once at server
 * startup (server.js) so the registry is populated before any route
 * can try to emit an event. New event definitions (stage 5+) get
 * their own file here and one require line added below.
 */
require("./financialContractCancelled");
require("./financialContractWithdrawn");
require("./learningActivityPublished");
require("./learningActivityChanged");
require("./learningActivityCancelled");
require("./learningContentPublished");
require("./learningContentChanged");
require("./learningContentCancelled");
require("./learningSessionScheduled");
require("./learningSessionChanged");
require("./learningSessionCancelled");
require("./learningSubmissionReceived");
require("./learningGradePublished");
require("./learningAttendanceFlagged");
require("./financialInvoiceChanged");
require("./financialInvoiceCancelled");
require("./financialPaymentApproved");
require("./financialPaymentRefunded");
require("./calendarEventPublished");
require("./calendarEventChanged");
require("./calendarEventCancelled");
require("./financialInvoiceReminder");
require("./financialInvoiceOverdue");
require("./financialInvoiceOverdueChargeWarning");
require("./financialEnrollmentLockWarning");
require("./financialEnrollmentLocked");
require("./chatMessageReceived");
require("./financialContractBillingCreated");
require("./accountActivationInvitationCreated");
require("./accountActivationAlreadyActiveNotice");
require("./checkoutEmailVerificationRequested");
require("./financialInvoicePaymentLinkShared");
require("./financialDocumentReady");
require("./financialInvoiceChanged");
require("./financialInvoiceCancelled");
require("./financialContractCancelled");
require("./financialPaymentApproved");
require("./financialPaymentRefunded");
require("./administrativeRequestCreated");
require("./administrativeRequestMessageReceived");
require("./adminCheckoutCompleted");
require("./adminEnrollmentCreated");
require("./adminUserCreated");
require("./adminPaymentRejected");
require("./adminFinancialPaymentReceived");
require("./adminFinancialInvoiceOverdue");
require("./adminFinancialInvoiceOverdue15Days");
require("./adminFinancialInvoiceOverdue30Days");
require("./adminContactCreated");
