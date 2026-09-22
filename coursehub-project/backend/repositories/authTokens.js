const db = require("../db");
const { generateOpaqueToken, hashToken } = require("../utils/tokens");
const { durationToMs } = require("../utils/cookies");

function expiresAtFromNow(ms) {
  return new Date(Date.now() + ms);
}

/* ==========================================================
   REFRESH TOKENS
   ========================================================== */

async function createRefreshToken(userId) {
  const rawToken = generateOpaqueToken();
  const tokenHash = hashToken(rawToken);

  const expiresAt = expiresAtFromNow(
    durationToMs(process.env.REFRESH_TOKEN_EXPIRES_IN, 7 * 24 * 60 * 60 * 1000)
  );

  await db.promise().query(
    `
      INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
      VALUES (?, ?, ?)
    `,
    [userId, tokenHash, expiresAt]
  );

  return rawToken;
}

/**
 * Retorna a linha do refresh token se ele existir, não estiver
 * revogado e ainda estiver dentro da validade — senão, null.
 */
async function findValidRefreshToken(rawToken) {
  const tokenHash = hashToken(rawToken);

  const [rows] = await db.promise().query(
    `
      SELECT id, user_id, expires_at, revoked_at
      FROM refresh_tokens
      WHERE token_hash = ?
      LIMIT 1
    `,
    [tokenHash]
  );

  if (rows.length === 0) {
    return null;
  }

  const token = rows[0];

  if (token.revoked_at || new Date(token.expires_at) <= new Date()) {
    return null;
  }

  return token;
}

async function revokeAllUserRefreshTokens(userId) {
  await db.promise().query(
    `
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE user_id = ? AND revoked_at IS NULL
    `,
    [userId]
  );
}

async function revokeRefreshTokenByRawValue(rawToken, replacedByRawToken) {
  const tokenHash = hashToken(rawToken);

  const replacedByHash = replacedByRawToken
    ? hashToken(replacedByRawToken)
    : null;

  await db.promise().query(
    `
      UPDATE refresh_tokens
      SET revoked_at = NOW(), replaced_by_token_hash = ?
      WHERE token_hash = ?
    `,
    [replacedByHash, tokenHash]
  );
}

/* ==========================================================
   TOKENS DE RECUPERAÇÃO DE SENHA
   ========================================================== */

async function createPasswordResetToken(userId) {
  const rawToken = generateOpaqueToken();
  const tokenHash = hashToken(rawToken);

  // 15 minutos — janela curta o suficiente para reduzir o risco de uso indevido.
  const expiresAt = expiresAtFromNow(15 * 60 * 1000);

  await db.promise().query(
    `
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES (?, ?, ?)
    `,
    [userId, tokenHash, expiresAt]
  );

  return rawToken;
}

async function findValidPasswordResetToken(rawToken) {
  const tokenHash = hashToken(rawToken);

  const [rows] = await db.promise().query(
    `
      SELECT id, user_id, expires_at, used_at
      FROM password_reset_tokens
      WHERE token_hash = ?
      LIMIT 1
    `,
    [tokenHash]
  );

  if (rows.length === 0) {
    return null;
  }

  const token = rows[0];

  if (token.used_at || new Date(token.expires_at) <= new Date()) {
    return null;
  }

  return token;
}

async function markPasswordResetTokenUsed(tokenId) {
  await db.promise().query(
    `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?`,
    [tokenId]
  );
}

async function purgeExpiredAuthTokens() {
  await db.promise().query(
    `DELETE FROM refresh_tokens WHERE expires_at < NOW()`
  );
  await db.promise().query(
    `
      DELETE FROM refresh_tokens
      WHERE revoked_at IS NOT NULL
        AND revoked_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
    `
  );
  await db.promise().query(
    `
      DELETE FROM password_reset_tokens
      WHERE expires_at < NOW() OR used_at IS NOT NULL
    `
  );
}

module.exports = {
  createRefreshToken,
  findValidRefreshToken,
  revokeRefreshTokenByRawValue,
  revokeAllUserRefreshTokens,
  createPasswordResetToken,
  findValidPasswordResetToken,
  markPasswordResetTokenUsed,
  purgeExpiredAuthTokens,
};
