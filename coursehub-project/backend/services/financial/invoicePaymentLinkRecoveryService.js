/**
 * "Não encontrou seu link?" (página pública Fale conosco) -- localiza,
 * a partir de um e-mail, a fatura em aberto mais urgente do
 * contratante e reenvia o link de pagamento pelo caminho já existente
 * (sendInvoicePaymentLinkByEmail: mesmo token opaco, mesmo outbox de
 * notificação, mesma invalidação do link anterior). Nenhuma fila,
 * token ou sessão nova é criada aqui -- este service só decide QUAL
 * invoice, se alguma, merece receber um link.
 *
 * Nunca revela ao chamador se o e-mail existe, se há fatura elegível,
 * nem qual é -- a rota que usa este service sempre responde a mesma
 * mensagem genérica (ver routes/publicInvoicePaymentRoutes.js), no
 * mesmo princípio do fluxo de "esqueci minha senha"
 * (services/auth/authService.js#requestPasswordReset).
 */
const { sendInvoicePaymentLinkByEmail } = require("./invoicePaymentAccessService");

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  if (typeof email !== "string") return null;

  const trimmed = email.trim().toLowerCase();

  return EMAIL_PATTERN.test(trimmed) ? trimmed : null;
}

const OPEN_INVOICE_STATUSES = ["pending", "processing", "overdue"];

async function requestInvoicePaymentLinkByEmail(db, { email }) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw createServiceError("Informe um e-mail válido.", 400);
  }

  const [rows] = await db.promise().query(
    `
      SELECT i.id AS invoice_id
      FROM invoices i
      INNER JOIN financial_contracts fc ON fc.id = i.financial_contract_id
      WHERE LOWER(fc.contracting_party_email) = ?
        AND i.status IN (${OPEN_INVOICE_STATUSES.map(() => "?").join(", ")})
      ORDER BY i.due_date ASC
      LIMIT 1
    `,
    [normalizedEmail, ...OPEN_INVOICE_STATUSES]
  );

  // Sem contratante/fatura elegível: não faz nada, silenciosamente.
  // O chamador (rota pública) responde a mesma mensagem genérica de
  // qualquer forma -- ver comentário no topo do arquivo.
  if (rows.length === 0) return;

  await sendInvoicePaymentLinkByEmail(db, { invoiceId: rows[0].invoice_id, actorUserId: null });
}

module.exports = { createServiceError, requestInvoicePaymentLinkByEmail };
