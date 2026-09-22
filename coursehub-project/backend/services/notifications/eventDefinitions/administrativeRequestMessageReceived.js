const { registerNotificationType } = require("../notificationTypeRegistry");

const PREVIEW_LENGTH = 140;

function truncateBody(body) {
  if (typeof body !== "string") {
    return "";
  }

  return body.length > PREVIEW_LENGTH ? `${body.slice(0, PREVIEW_LENGTH)}...` : body;
}

/**
 * The administrative_support counterpart of chat.message.received --
 * same trigger (chatMessageService.createMessage /
 * chatConversationService.createConversation), same recipient
 * resolver (resolveOtherActiveParticipants), but its own type/category
 * so these messages surface under "Requerimentos" in the admin inbox
 * instead of the generic "Chat" category. The two are mutually
 * exclusive per message -- a conversation is branched to exactly one
 * of them, never both.
 */
registerNotificationType({
  type: "administrative.request.message_received",
  category: "request",
  priority: "normal",
  emailPolicy: "default_off",
  requiredContext: ["messageId", "conversationId", "senderName", "messageBody"],

  buildTitle: (context) => `Nova mensagem de ${context.senderName}`,

  buildMessage: (context) => truncateBody(context.messageBody),

  buildActionPath: (context, role) => {
    if (role === "admin" || role === "moderator") return `/admin/chat?conversationId=${context.conversationId}`;

    return "/aluno/chat";
  },

  buildDeduplicationKey: (context) => `admin:request-message:${context.messageId}`,

  recipientPolicy: "resolveOtherActiveParticipants(conversationId, excludeUserId)",
});
