const bcrypt = require("bcryptjs");

const generateAccessToken = require("../../utils/generateToken");

const {
  createRefreshToken,
  findValidRefreshToken,
  revokeRefreshTokenByRawValue,
  revokeAllUserRefreshTokens,
  createPasswordResetToken,
  findValidPasswordResetToken,
  markPasswordResetTokenUsed,
} = require("../../repositories/authTokens");

const { sendPasswordResetEmail } = require("../../utils/mailer");

/**
 * Cria um erro de negócio com status HTTP associado.
 */
function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

/**
 * Autentica um usuário por e-mail/senha e emite um novo par
 * de tokens (access + refresh).
 */
async function login(db, { email, password }) {
  if (!email || !password) {
    throw createServiceError("E-mail e senha são obrigatórios.", 400);
  }

  const normalizedEmail = email.trim().toLowerCase();

  const [userRows] = await db.promise().query(
    `
    SELECT id, name, email, password_hash, role, status, avatar_key, avatar_file_id
    FROM users
    WHERE email = ?
    LIMIT 1
    `,
    [normalizedEmail]
  );

  if (userRows.length === 0) {
    throw createServiceError("E-mail ou senha inválidos.", 401);
  }

  const user = userRows[0];

  if (user.status !== "active") {
    throw createServiceError("Conta inativa ou bloqueada.", 403);
  }

  // Defesa em profundidade: uma conta 'pending_activation' já é
  // barrada acima antes de chegar aqui (é a única que nasce com
  // password_hash NULL), mas nunca confia nisso silenciosamente --
  // bcrypt.compare com hash nulo lançaria um erro genérico em vez de
  // "credenciais inválidas".
  if (!user.password_hash) {
    throw createServiceError("E-mail ou senha inválidos.", 401);
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);

  if (!passwordMatches) {
    throw createServiceError("E-mail ou senha inválidos.", 401);
  }

  const accessToken = generateAccessToken({
    userId: user.id,
    role: user.role,
  });

  const refreshToken = await createRefreshToken(user.id);

  return {
    accessToken,
    refreshToken,
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      avatarKey: user.avatar_key || null,
      avatarFileId: user.avatar_file_id || null,
    },
  };
}

/**
 * Revoga o refresh token informado. Falhas são responsabilidade
 * do chamador tratar como não-fatais — o logout do usuário nunca
 * pode ficar travado por causa de um erro de revogação.
 */
async function revokeSession(refreshToken) {
  await revokeRefreshTokenByRawValue(refreshToken);
}

/**
 * Renova o access token usando o refresh token do cookie,
 * rotacionando-o a cada uso (defesa contra reuso de um token roubado).
 *
 * Quando a sessão é inválida, o erro carrega `clearCookies: true`
 * para que a camada HTTP saiba que também precisa limpar os cookies
 * de autenticação, não só responder com erro.
 */
async function refreshSession(db, { refreshToken }) {
  if (!refreshToken) {
    throw createServiceError("Sessão não encontrada.", 401);
  }

  const tokenRow = await findValidRefreshToken(refreshToken);

  if (!tokenRow) {
    const error = createServiceError(
      "Sessão expirada. Faça login novamente.",
      401
    );
    error.clearCookies = true;
    throw error;
  }

  const [userRows] = await db.promise().query(
    `
    SELECT id, role, status
    FROM users
    WHERE id = ?
    LIMIT 1
    `,
    [tokenRow.user_id]
  );

  if (userRows.length === 0 || userRows[0].status !== "active") {
    await revokeRefreshTokenByRawValue(refreshToken);

    const error = createServiceError("Sessão inválida.", 401);
    error.clearCookies = true;
    throw error;
  }

  const user = userRows[0];

  const newRefreshToken = await createRefreshToken(user.id);

  await revokeRefreshTokenByRawValue(refreshToken, newRefreshToken);

  const newAccessToken = generateAccessToken({
    userId: user.id,
    role: user.role,
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

/**
 * Etapa 1 da recuperação de senha. Sempre resolve normalmente
 * (nunca lança para "e-mail não encontrado" ou falha de envio)
 * para não revelar quais e-mails têm cadastro no sistema
 * (enumeration attack) — só valida a ausência do próprio e-mail.
 */
async function requestPasswordReset(db, { email }) {
  if (!email) {
    throw createServiceError("O e-mail é obrigatório.", 400);
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const [userRows] = await db.promise().query(
      `
      SELECT id, email, status
      FROM users
      WHERE email = ?
      LIMIT 1
      `,
      [normalizedEmail]
    );

    if (userRows.length === 0 || userRows[0].status !== "active") {
      return;
    }

    const user = userRows[0];

    const resetToken = await createPasswordResetToken(user.id);

    const resetUrl = `${
      process.env.FRONTEND_URL || "http://localhost:5173"
    }/redefinir-senha?token=${resetToken}`;

    await sendPasswordResetEmail({ to: user.email, resetUrl });
  } catch (error) {
    console.error("Erro ao processar recuperação de senha:", error);
    // Mesmo em erro interno, não revela se o e-mail existe.
  }
}

/**
 * Etapa 2 da recuperação de senha: troca a senha usando um
 * token de redefinição válido e revoga todas as sessões abertas.
 */
async function resetPassword(db, { token, newPassword, confirmPassword }) {
  if (!token || !newPassword || !confirmPassword) {
    throw createServiceError(
      "Token, nova senha e confirmação são obrigatórios.",
      400
    );
  }

  if (newPassword !== confirmPassword) {
    throw createServiceError(
      "A confirmação da nova senha não confere.",
      400
    );
  }

  if (newPassword.length < 6) {
    throw createServiceError(
      "A nova senha deve possuir pelo menos 6 caracteres.",
      400
    );
  }

  const resetToken = await findValidPasswordResetToken(token);

  if (!resetToken) {
    throw createServiceError(
      "Este link de redefinição é inválido ou expirou. Solicite um novo.",
      400
    );
  }

  const [userRows] = await db.promise().query(
    `
    SELECT id, status
    FROM users
    WHERE id = ?
    LIMIT 1
    `,
    [resetToken.user_id]
  );

  if (userRows.length === 0 || userRows[0].status !== "active") {
    throw createServiceError(
      "Não é possível redefinir a senha desta conta.",
      403
    );
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 10);

  await db.promise().query(
    `
    UPDATE users
    SET password_hash = ?, updated_at = NOW()
    WHERE id = ?
    `,
    [newPasswordHash, resetToken.user_id]
  );

  await markPasswordResetTokenUsed(resetToken.id);
  await revokeAllUserRefreshTokens(resetToken.user_id);
}

module.exports = {
  createServiceError,
  login,
  revokeSession,
  refreshSession,
  requestPasswordReset,
  resetPassword,
};
