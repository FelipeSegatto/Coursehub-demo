const nodemailer = require("nodemailer");
const { buildPasswordResetEmail } = require("../email/templates/passwordResetEmail");

let transporterPromise = null;

/**
 * Cria (uma única vez) o transporte de e-mail.
 *
 * Em produção/qualquer ambiente com SMTP_HOST configurado no .env,
 * usa o provedor real. Sem SMTP_HOST (ex.: desenvolvimento local),
 * cria automaticamente uma conta de teste Ethereal — nenhuma
 * credencial é necessária e cada e-mail "enviado" gera um link de
 * preview que aparece no console do servidor.
 */
async function getTransporter() {
  if (transporterPromise) {
    return transporterPromise;
  }

  if (process.env.SMTP_HOST) {
    transporterPromise = Promise.resolve(
      nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === "true",
        auth: process.env.SMTP_USER
          ? {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASS,
            }
          : undefined,
      })
    );

    return transporterPromise;
  }

  transporterPromise = nodemailer
    .createTestAccount()
    .then((testAccount) =>
      nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      })
    );

  return transporterPromise;
}

/**
 * Generic send, used by both the password-reset flow and the
 * notification outbox worker. Never logs `to` or the message body --
 * callers that need a preview link in dev get it back on the
 * returned value instead of it being printed here.
 */
async function sendEmail({ to, subject, text, html }) {
  const transporter = await getTransporter();

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || "CourseHub <no-reply@coursehub.local>",
    to,
    subject,
    text,
    html,
  });

  const previewUrl = process.env.SMTP_HOST ? null : nodemailer.getTestMessageUrl(info) || null;

  return {
    messageId: info.messageId,
    previewUrl,
  };
}

async function sendPasswordResetEmail({ to, resetUrl }) {
  const { subject, text, html } = buildPasswordResetEmail({ resetUrl });
  const result = await sendEmail({ to, subject, text, html });

  if (result.previewUrl) {
    console.log("[mailer] Conta de teste (Ethereal) — preview do e-mail:", result.previewUrl);
  }

  return result;
}

module.exports = { sendEmail, sendPasswordResetEmail };
