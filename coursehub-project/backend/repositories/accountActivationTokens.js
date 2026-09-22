/**
 * account_activation_tokens -- mesmo padrão opaco/hash de
 * repositories/authTokens.js (generateOpaqueToken/hashToken), mas
 * como fluxo próprio: diferente de password_reset_tokens, este
 * sempre invalida qualquer token anterior ainda válido ao emitir um
 * novo (nunca duas ligações de ativação válidas ao mesmo tempo para
 * o mesmo usuário).
 *
 * Ao contrário de authTokens.js (que sempre usa o pool `db` direto),
 * cada função aqui recebe `runner` (pool.promise() ou uma conexão de
 * transação aberta) -- criação de token precisa rodar dentro da MESMA
 * transação que ativa o contrato/matrícula, e consumo precisa rodar
 * dentro da transação que troca a senha e ativa a conta.
 */
const { generateOpaqueToken, hashToken } = require("../utils/tokens");

function getTtlMinutes() {
  const configured = Number(process.env.ACCOUNT_ACTIVATION_TOKEN_TTL_MINUTES);

  return Number.isFinite(configured) && configured > 0 ? configured : 24 * 60;
}

function expiresAtFromNow() {
  return new Date(Date.now() + getTtlMinutes() * 60 * 1000);
}

/**
 * Invalida qualquer token ainda utilizável do usuário e cria um novo.
 * As duas operações sempre acontecem juntas -- nunca se emite um
 * token novo sem invalidar o anterior (única ligação válida por vez).
 */
async function invalidateActiveTokensForUser(runner, userId) {
  await runner.query(
    `
      UPDATE account_activation_tokens
      SET invalidated_at = NOW()
      WHERE user_id = ? AND used_at IS NULL AND invalidated_at IS NULL AND expires_at > NOW()
    `,
    [userId]
  );
}

async function createActivationToken(runner, userId) {
  await invalidateActiveTokensForUser(runner, userId);

  const rawToken = generateOpaqueToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = expiresAtFromNow();

  await runner.query(
    `
      INSERT INTO account_activation_tokens (user_id, token_hash, expires_at)
      VALUES (?, ?, ?)
    `,
    [userId, tokenHash, expiresAt]
  );

  return { rawToken, expiresAt };
}

/**
 * Retorna a linha do token se ele existir, não estiver usado nem
 * invalidado, e ainda estiver dentro da validade -- senão, null.
 * Nunca revela QUAL dessas condições falhou (evita enumeração).
 */
async function findValidActivationToken(runner, rawToken) {
  const tokenHash = hashToken(rawToken);

  const [rows] = await runner.query(
    `
      SELECT id, user_id, expires_at, used_at, invalidated_at
      FROM account_activation_tokens
      WHERE token_hash = ?
      LIMIT 1
    `,
    [tokenHash]
  );

  if (rows.length === 0) {
    return null;
  }

  const token = rows[0];

  if (token.used_at || token.invalidated_at || new Date(token.expires_at) <= new Date()) {
    return null;
  }

  return token;
}

async function markActivationTokenUsed(runner, tokenId) {
  await runner.query(`UPDATE account_activation_tokens SET used_at = NOW() WHERE id = ?`, [
    tokenId,
  ]);
}

module.exports = {
  getTtlMinutes,
  invalidateActiveTokensForUser,
  createActivationToken,
  findValidActivationToken,
  markActivationTokenUsed,
};
