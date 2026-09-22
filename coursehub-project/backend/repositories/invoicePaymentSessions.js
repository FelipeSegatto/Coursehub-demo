/**
 * invoice_payment_sessions -- sessão curta trocada a partir de um
 * invoice_payment_access_tokens válido (ver
 * services/financial/invoicePaymentAccessService.js#exchangeInvoicePaymentToken).
 * Mesmo padrão opaco/hash de token, mas vida curta e escopo de uma
 * única invoice, ligada a um cookie HTTP-only em vez de exposta na
 * URL depois da troca inicial. Ver migration
 * 20260814_003_create_invoice_payment_sessions_table.sql.
 */
const { generateOpaqueToken, hashToken } = require("../utils/tokens");
const { INVOICE_PAYMENT_SESSION_TTL_MINUTES } = require("../config/checkoutConfig");

function getTtlMinutes() {
  return INVOICE_PAYMENT_SESSION_TTL_MINUTES;
}

function expiresAtFromNow() {
  return new Date(Date.now() + getTtlMinutes() * 60 * 1000);
}

async function createSession(runner, { accessTokenId, invoiceId }) {
  const rawSessionToken = generateOpaqueToken();
  const sessionTokenHash = hashToken(rawSessionToken);
  const expiresAt = expiresAtFromNow();

  await runner.query(
    `
      INSERT INTO invoice_payment_sessions
        (invoice_payment_access_token_id, invoice_id, session_token_hash, expires_at)
      VALUES (?, ?, ?, ?)
    `,
    [accessTokenId, invoiceId, sessionTokenHash, expiresAt]
  );

  return { rawSessionToken, expiresAt };
}

/**
 * Retorna { id, invoiceId } se a sessão existir, não estiver revogada
 * e ainda estiver dentro da validade -- senão, null. Deliberadamente
 * não checa o status da invoice aqui: uma sessão já aberta antes de a
 * invoice fechar continua válida até seu próprio TTL (ver comentário
 * de domínio na migration).
 */
async function findValidSession(runner, rawSessionToken) {
  const sessionTokenHash = hashToken(rawSessionToken);

  const [rows] = await runner.query(
    `
      SELECT id, invoice_id, expires_at, revoked_at
      FROM invoice_payment_sessions
      WHERE session_token_hash = ?
      LIMIT 1
    `,
    [sessionTokenHash]
  );

  if (rows.length === 0) {
    return null;
  }

  const session = rows[0];

  if (session.revoked_at || new Date(session.expires_at) <= new Date()) {
    return null;
  }

  return { id: session.id, invoiceId: session.invoice_id };
}

async function touchLastAccessed(runner, sessionId) {
  await runner.query(`UPDATE invoice_payment_sessions SET last_accessed_at = NOW() WHERE id = ?`, [
    sessionId,
  ]);
}

async function revokeSession(runner, sessionId) {
  await runner.query(`UPDATE invoice_payment_sessions SET revoked_at = NOW() WHERE id = ?`, [
    sessionId,
  ]);
}

module.exports = {
  getTtlMinutes,
  createSession,
  findValidSession,
  touchLastAccessed,
  revokeSession,
};
