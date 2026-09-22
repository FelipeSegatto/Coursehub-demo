/**
 * Exige uma sessão curta de pagamento de invoice válida (cookie
 * HTTP-only, ver utils/cookies.js#setInvoicePaymentSessionCookie),
 * estabelecida por uma troca anterior de token em
 * POST /api/public/invoice-payment/session. Nunca aceita um invoiceId
 * do corpo/query da requisição -- req.invoicePaymentSession.invoiceId
 * é a única fonte de autoridade para o resto da rota.
 */
const db = require("../db");
const { findValidSession, touchLastAccessed } = require("../repositories/invoicePaymentSessions");
const { INVOICE_PAYMENT_SESSION_COOKIE } = require("../utils/cookies");

async function requireInvoicePaymentSession(req, res, next) {
  try {
    const rawSessionToken = req.cookies?.[INVOICE_PAYMENT_SESSION_COOKIE];

    if (!rawSessionToken) {
      return res.status(401).json({ message: "Sessão expirada. Abra o link novamente." });
    }

    const session = await findValidSession(db.promise(), rawSessionToken);

    if (!session) {
      return res.status(401).json({ message: "Sessão expirada. Abra o link novamente." });
    }

    await touchLastAccessed(db.promise(), session.id);

    req.invoicePaymentSession = { sessionId: session.id, invoiceId: session.invoiceId };

    return next();
  } catch (error) {
    console.error("Erro ao validar sessão de pagamento de fatura:", error);

    return res.status(500).json({ message: "Erro interno ao validar sessão de pagamento." });
  }
}

module.exports = requireInvoicePaymentSession;
