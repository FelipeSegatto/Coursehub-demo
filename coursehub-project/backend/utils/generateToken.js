const jwt = require("jsonwebtoken");

/**
 * Gera o access token (JWT curto, usado em toda requisição autenticada).
 * Vida curta de propósito: se vazar, a janela de uso indevido é pequena.
 * Sessões longas ficam por conta do refresh token (ver utils/tokens.js).
 */
function generateAccessToken({ userId, role }) {
  return jwt.sign(
    {
      role,
    },
    process.env.JWT_SECRET,
    {
      subject: String(userId),
      expiresIn:
        process.env.ACCESS_TOKEN_EXPIRES_IN || "15m",
      issuer: "coursehub-api",
      audience: "coursehub-web",
    }
  );
}

module.exports = generateAccessToken;