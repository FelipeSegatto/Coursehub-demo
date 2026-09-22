const crypto = require("crypto");

/**
 * Gera um token opaco aleatório (para refresh token e reset de senha).
 * O valor bruto só existe em memória/no cookie/no e-mail — o banco
 * guarda apenas o hash, então um vazamento do banco não expõe tokens.
 */
function generateOpaqueToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

module.exports = { generateOpaqueToken, hashToken };
