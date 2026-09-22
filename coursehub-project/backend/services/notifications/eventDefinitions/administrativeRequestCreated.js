const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * Fired directly by chatAdministrativeSupportService.openAdministrativeTicket,
 * right after the ticket/conversation is persisted -- NOT through the
 * generic chat.message.received pipeline. A fresh administrative_support
 * ticket has only the student as a chat_participants row
 * (assigned_user_id IS NULL), so resolveOtherActiveParticipants would
 * resolve to nobody until an admin claims it. resolveAllActiveAdmins
 * is used instead, so every active admin sees "Novo requerimento"
 * immediately, without the ticket being auto-assigned to anyone --
 * notification and assignment are independent decisions.
 */
registerNotificationType({
  type: "administrative.request.created",
  category: "request",
  priority: "normal",
  emailPolicy: "default_off",
  requiredContext: ["conversationId", "studentName", "subject", "administrativeCategory"],

  buildTitle: () => "Novo requerimento",

  buildMessage: (context) => `${context.studentName} abriu um novo requerimento: ${context.subject}.`,

  buildActionPath: (context) => `/admin/chat?conversationId=${context.conversationId}`,

  buildDeduplicationKey: (context) => `admin:request-created:${context.conversationId}`,

  recipientPolicy: "resolveAllActiveAdmins() -- ticket starts with zero admin participants",
});
