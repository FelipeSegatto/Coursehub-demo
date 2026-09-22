const { notifyAdminContactCreated } = require("../notifications/adminUserNotificationService");

const MAX_NAME_LENGTH = 150;
const MAX_EMAIL_LENGTH = 150;
const MAX_PHONE_LENGTH = 30;
const MAX_SUBJECT_LENGTH = 180;
const MAX_MESSAGE_LENGTH = 2000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

/**
 * Formulário público de contato (ContactPage.jsx) -- não exige
 * autenticação. Persiste primeiro, notifica depois (a notificação
 * nunca desfaz o registro se falhar -- ver notifyAdminContactCreated).
 */
async function createContactRequest(db, payload) {
  const name = typeof payload?.name === "string" ? payload.name.trim() : "";
  const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
  const phone = typeof payload?.phone === "string" ? payload.phone.trim() : "";
  const subject = typeof payload?.subject === "string" ? payload.subject.trim() : "";
  const message = typeof payload?.message === "string" ? payload.message.trim() : "";

  if (!name) {
    throw createServiceError("Informe seu nome.", 400);
  }

  if (name.length > MAX_NAME_LENGTH) {
    throw createServiceError(`O nome deve ter no máximo ${MAX_NAME_LENGTH} caracteres.`, 400);
  }

  if (!email || !EMAIL_PATTERN.test(email)) {
    throw createServiceError("Informe um e-mail válido.", 400);
  }

  if (email.length > MAX_EMAIL_LENGTH) {
    throw createServiceError(`O e-mail deve ter no máximo ${MAX_EMAIL_LENGTH} caracteres.`, 400);
  }

  if (phone.length > MAX_PHONE_LENGTH) {
    throw createServiceError(`O telefone deve ter no máximo ${MAX_PHONE_LENGTH} caracteres.`, 400);
  }

  if (!subject) {
    throw createServiceError("Informe o assunto da mensagem.", 400);
  }

  if (subject.length > MAX_SUBJECT_LENGTH) {
    throw createServiceError(`O assunto deve ter no máximo ${MAX_SUBJECT_LENGTH} caracteres.`, 400);
  }

  if (!message) {
    throw createServiceError("Escreva sua mensagem.", 400);
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    throw createServiceError(`A mensagem deve ter no máximo ${MAX_MESSAGE_LENGTH} caracteres.`, 400);
  }

  const [result] = await db.promise().query(
    `
      INSERT INTO public_contact_requests (name, email, phone, subject, message, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'new', NOW(), NOW())
    `,
    [name, email, phone || null, subject, message]
  );

  const contactRequestId = result.insertId;

  await notifyAdminContactCreated(db, {
    contactRequestId,
    senderName: name,
    senderEmail: email,
    subject,
  });

  return { id: contactRequestId };
}

module.exports = {
  createServiceError,
  createContactRequest,
};
