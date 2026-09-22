const { registerNotificationType } = require("../notificationTypeRegistry");

/**
 * Fired from publicContactService.createContactRequest, right after
 * the public_contact_requests row is persisted. context deliberately
 * carries only `subject`, never the full message body -- a contact
 * submission can be up to 2000 chars, and the notification snapshot
 * should stay a short summary, not a copy of the whole message (the
 * admin reads the full message on the /admin/contatos listing).
 */
registerNotificationType({
  type: "admin.contact.created",
  category: "contact",
  priority: "normal",
  emailPolicy: "default_off",
  requiredContext: ["contactRequestId", "senderName", "subject"],

  buildTitle: () => "Novo contato recebido",

  buildMessage: (context) => `${context.senderName} enviou uma nova mensagem pelo formulário de contato: "${context.subject}".`,

  buildActionPath: () => "/admin/contatos",

  buildDeduplicationKey: (context) => `admin:contact-created:${context.contactRequestId}`,

  recipientPolicy: "resolveAllActiveAdmins()",
});
