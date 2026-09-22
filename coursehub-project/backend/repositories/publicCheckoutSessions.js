/**
 * public_checkout_sessions -- sessão de checkout público, aberta
 * antes de qualquer usuário/contrato/invoice existir, para impedir
 * criação massiva de contratos falsos por requisições anônimas. Não é
 * contrato nem invoice -- ver migration
 * 20260814_004_create_public_checkout_sessions_table.sql para as
 * regras de domínio completas.
 */
const { generateOpaqueToken, hashToken } = require("../utils/tokens");
const { PUBLIC_CHECKOUT_SESSION_TTL_MINUTES } = require("../config/checkoutConfig");

function sessionExpiresAtFromNow() {
  return new Date(Date.now() + PUBLIC_CHECKOUT_SESSION_TTL_MINUTES * 60 * 1000);
}

/**
 * A sessão em si (session_token) e a verificação de e-mail
 * (email_verification_token) compartilham a mesma linha/expires_at
 * (uma única TTL para a sessão toda) -- não há necessidade de dois
 * prazos independentes neste estágio: se o e-mail não for confirmado
 * a tempo, a sessão inteira expira e o checkout recomeça do zero.
 */
async function createSession(runner, { courseId, pricingPlanId, email }) {
  const rawSessionToken = generateOpaqueToken();
  const sessionTokenHash = hashToken(rawSessionToken);

  const rawEmailVerificationToken = generateOpaqueToken();
  const emailVerificationTokenHash = hashToken(rawEmailVerificationToken);

  const expiresAt = sessionExpiresAtFromNow();

  const [result] = await runner.query(
    `
      INSERT INTO public_checkout_sessions
        (session_token_hash, course_id, pricing_plan_id, contracting_party_email,
         email_verification_token_hash, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [sessionTokenHash, courseId, pricingPlanId, email, emailVerificationTokenHash, expiresAt]
  );

  return {
    id: result.insertId,
    rawSessionToken,
    rawEmailVerificationToken,
    expiresAt,
  };
}

function isUsable(session) {
  return Boolean(session) && new Date(session.expires_at) > new Date();
}

async function findSessionByToken(runner, rawSessionToken) {
  const sessionTokenHash = hashToken(rawSessionToken);

  const [rows] = await runner.query(
    `SELECT * FROM public_checkout_sessions WHERE session_token_hash = ? LIMIT 1`,
    [sessionTokenHash]
  );

  const session = rows[0] || null;

  return isUsable(session) ? session : null;
}

/**
 * Retorna a sessão se o token de verificação de e-mail existir, ainda
 * não tiver sido confirmado, e a sessão ainda estiver dentro da
 * validade -- senão, null. Nunca revela qual dessas condições falhou.
 */
async function findValidEmailVerificationToken(runner, rawToken) {
  const emailVerificationTokenHash = hashToken(rawToken);

  const [rows] = await runner.query(
    `SELECT * FROM public_checkout_sessions WHERE email_verification_token_hash = ? LIMIT 1`,
    [emailVerificationTokenHash]
  );

  const session = rows[0] || null;

  if (!isUsable(session) || session.email_verified_at) {
    return null;
  }

  return session;
}

async function markEmailVerified(runner, sessionId) {
  await runner.query(
    `UPDATE public_checkout_sessions SET status = 'verified', email_verified_at = NOW() WHERE id = ?`,
    [sessionId]
  );
}

async function markConverted(runner, sessionId, financialContractId) {
  await runner.query(
    `
      UPDATE public_checkout_sessions
      SET status = 'converted', financial_contract_id = ?, completed_at = NOW()
      WHERE id = ?
    `,
    [financialContractId, sessionId]
  );
}

module.exports = {
  createSession,
  findSessionByToken,
  findValidEmailVerificationToken,
  markEmailVerified,
  markConverted,
};
