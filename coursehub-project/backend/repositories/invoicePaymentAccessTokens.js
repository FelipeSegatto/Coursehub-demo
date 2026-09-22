/**
 * invoice_payment_access_tokens -- mesmo padrão opaco/hash de
 * repositories/accountActivationTokens.js, mas ancorado em invoice_id
 * em vez de user_id (o destinatário nem sempre tem uma conta
 * CourseHub). Diferença chave: não existe used_at aqui -- abrir o
 * link (visualizar a cobrança) nunca consome o token, só
 * invalidated_at/expires_at decidem se ele ainda é utilizável. Ver
 * migration 20260814_002_create_invoice_payment_access_tokens_table.sql.
 *
 * Cada função recebe `runner` (pool.promise() ou uma conexão de
 * transação aberta), mesmo padrão de accountActivationTokens.js --
 * criação roda dentro da mesma transação que cria o contrato/invoice
 * quando aplicável.
 */
const { generateOpaqueToken, hashToken } = require("../utils/tokens");
const { INVOICE_PAYMENT_LINK_TTL_DAYS } = require("../config/checkoutConfig");

function getTtlDays() {
  return INVOICE_PAYMENT_LINK_TTL_DAYS;
}

function expiresAtFromNow() {
  return new Date(Date.now() + getTtlDays() * 24 * 60 * 60 * 1000);
}

/**
 * Invalida todo token ainda utilizável de uma invoice específica.
 * Chamado tanto ao emitir um novo link (só um link ativo por vez)
 * quanto quando a invoice fecha (paga/cancelada/reembolsada) --
 * bloqueia só trocas NOVAS, uma sessão já aberta continua até seu
 * próprio TTL (ver invoicePaymentSessions.js).
 */
async function invalidateActiveTokensForInvoice(runner, invoiceId) {
  await runner.query(
    `
      UPDATE invoice_payment_access_tokens
      SET invalidated_at = NOW()
      WHERE invoice_id = ? AND invalidated_at IS NULL AND expires_at > NOW()
    `,
    [invoiceId]
  );
}

async function createAccessToken(
  runner,
  { invoiceId, recipientName, recipientEmail, createdByUserId = null }
) {
  await invalidateActiveTokensForInvoice(runner, invoiceId);

  const rawToken = generateOpaqueToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = expiresAtFromNow();

  const [result] = await runner.query(
    `
      INSERT INTO invoice_payment_access_tokens
        (invoice_id, token_hash, recipient_name_snapshot, recipient_email_snapshot, expires_at, created_by_user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [invoiceId, tokenHash, recipientName || "", recipientEmail || "", expiresAt, createdByUserId]
  );

  return { id: result.insertId, rawToken, expiresAt };
}

/**
 * Retorna a linha do token se existir, não estiver invalidado e ainda
 * estiver dentro da validade -- senão, null. Nunca revela QUAL dessas
 * condições falhou (mesmo princípio de accountActivationTokens.js,
 * evita enumeração/oráculo de token).
 */
async function findValidAccessToken(runner, rawToken) {
  const tokenHash = hashToken(rawToken);

  const [rows] = await runner.query(
    `
      SELECT id, invoice_id, expires_at, invalidated_at
      FROM invoice_payment_access_tokens
      WHERE token_hash = ?
      LIMIT 1
    `,
    [tokenHash]
  );

  if (rows.length === 0) {
    return null;
  }

  const token = rows[0];

  if (token.invalidated_at || new Date(token.expires_at) <= new Date()) {
    return null;
  }

  return token;
}

async function touchLastAccessed(runner, tokenId) {
  await runner.query(
    `UPDATE invoice_payment_access_tokens SET last_accessed_at = NOW() WHERE id = ?`,
    [tokenId]
  );
}

module.exports = {
  getTtlDays,
  invalidateActiveTokensForInvoice,
  createAccessToken,
  findValidAccessToken,
  touchLastAccessed,
};
