const { registerNotificationType } = require("../notificationTypeRegistry");

const PREVIEW_LENGTH = 140;

function truncateBody(body) {
  if (typeof body !== "string") {
    return "";
  }

  return body.length > PREVIEW_LENGTH ? `${body.slice(0, PREVIEW_LENGTH)}...` : body;
}

/**
 * Etapa 13: closes the gap between chat (Etapas 7-12, which only ever
 * updated chat_participants.last_read_message_id -- a signal only
 * visible while actually polling the chat pages) and the shared
 * notification center every other domain already reports through.
 * One notification per message, same "genuinely new event" reasoning
 * as learning.attendance.flagged -- there's no meaningful way to
 * collapse repeated messages into a single notification without
 * either violating the "notifications are immutable snapshots" rule
 * (nothing here ever mutates an existing row) or inventing new
 * per-conversation dedup state this stage doesn't need. Volume is the
 * inbox UI's job (mark-read/archive), same as every other type.
 *
 * emailPolicy is default_off deliberately -- unlike a grade or an
 * overdue invoice, a chat message is inherently high-frequency and
 * time-boxed by the conversation itself; emailing every message by
 * default would be noisy in exactly the cases (an active back-and-
 * forth) where it matters least. Users who want an email per message
 * can still opt in via the same preferences panel every other
 * category uses.
 */
registerNotificationType({
  type: "chat.message.received",
  category: "chat",
  priority: "normal",
  emailPolicy: "default_off",
  requiredContext: ["messageId", "conversationId", "conversationType", "senderName", "messageBody"],

  buildTitle: (context) => `Nova mensagem de ${context.senderName}`,

  buildMessage: (context) => truncateBody(context.messageBody),

  buildActionPath: (context, role) => {
    if (role === "teacher") return "/professor/chat";
    if (role === "admin" || role === "moderator") return "/admin/chat";

    return "/aluno/chat";
  },

  buildDeduplicationKey: (context) => `chat.message.received:${context.messageId}`,

  recipientPolicy: "resolveOtherActiveParticipants(conversationId, excludeUserId)",
});
