/**
 * Sessão de checkout público: curso + plano + e-mail, verificada
 * antes de qualquer usuário/contrato/invoice ser criado. Ver
 * repositories/publicCheckoutSessions.js e migration
 * 20260814_004_create_public_checkout_sessions_table.sql.
 */
const {
  createSession,
  findSessionByToken,
  findValidEmailVerificationToken,
  markEmailVerified,
} = require("../../repositories/publicCheckoutSessions");
const { loadValidatedPlan } = require("./contractCreationService");
const { createNotificationEvent } = require("../notifications/notificationService");

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/public/checkout/sessions -- revalida curso/plano no banco
 * (nunca confia em nada além dos ids) e dispara a verificação de
 * e-mail. Nenhum dado além de {courseId, pricingPlanId, email} é
 * gravado nesta etapa.
 */
async function startPublicCheckoutSession(db, { courseId, pricingPlanId, email }) {
  const normalizedCourseId = Number(courseId);
  const normalizedPricingPlanId = Number(pricingPlanId);

  if (!Number.isInteger(normalizedCourseId) || normalizedCourseId <= 0) {
    throw createServiceError("Curso é obrigatório e deve ser válido.", 400);
  }

  if (!Number.isInteger(normalizedPricingPlanId) || normalizedPricingPlanId <= 0) {
    throw createServiceError("Plano de preço é obrigatório e deve ser válido.", 400);
  }

  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    throw createServiceError("Informe um e-mail válido.", 400);
  }

  const runner = db.promise();

  // Mesma validação usada pelo wizard admin (loadValidatedPlan) --
  // plano precisa existir, estar ativo e pertencer a este curso.
  await loadValidatedPlan(runner, {
    courseId: normalizedCourseId,
    pricingPlanId: normalizedPricingPlanId,
  });

  const [courseRows] = await runner.query(`SELECT name FROM courses WHERE id = ? LIMIT 1`, [
    normalizedCourseId,
  ]);

  const courseName = courseRows[0]?.name || "";

  const { rawSessionToken, rawEmailVerificationToken, expiresAt } = await createSession(runner, {
    courseId: normalizedCourseId,
    pricingPlanId: normalizedPricingPlanId,
    email: normalizedEmail,
  });

  try {
    await createNotificationEvent(db, {
      type: "checkout.email_verification_requested",
      sourceType: "public_checkout_session",
      sourceId: null,
      context: {
        courseName,
        verificationPath: `/checkout/verificar-email?token=${rawEmailVerificationToken}`,
        sessionToken: rawSessionToken,
      },
      recipients: [{ external: true, email: normalizedEmail }],
      excludeActor: false,
    });
  } catch (notificationError) {
    console.error(
      "[publicCheckoutSessionService] falha ao agendar e-mail de verificação:",
      notificationError
    );
  }

  return { checkoutToken: rawSessionToken, expiresAt };
}

/** GET /api/public/checkout/sessions/:checkoutToken -- para o wizard saber se já pode avançar. */
async function getCheckoutSessionStatus(db, checkoutToken) {
  const session = await findSessionByToken(db.promise(), checkoutToken);

  if (!session) {
    throw createServiceError("Sessão de checkout inválida ou expirada.", 404);
  }

  return { status: session.status, expiresAt: session.expires_at };
}

/** GET /api/public/checkout/verify-email/validate?token= -- nunca revela por que um token é inválido. */
async function validateCheckoutEmailToken(db, rawToken) {
  if (!rawToken) {
    return { valid: false };
  }

  const session = await findValidEmailVerificationToken(db.promise(), rawToken);

  return { valid: Boolean(session) };
}

/** POST /api/public/checkout/verify-email -- confirma o e-mail, marca a sessão verified. */
async function verifyCheckoutEmail(db, rawToken) {
  if (!rawToken) {
    throw createServiceError("Link de verificação inválido ou expirado.", 400);
  }

  const runner = db.promise();
  const session = await findValidEmailVerificationToken(runner, rawToken);

  if (!session) {
    throw createServiceError("Link de verificação inválido ou expirado.", 400);
  }

  await markEmailVerified(runner, session.id);

  return { message: "E-mail confirmado. Você já pode continuar a contratação." };
}

module.exports = {
  createServiceError,
  startPublicCheckoutSession,
  getCheckoutSessionStatus,
  validateCheckoutEmailToken,
  verifyCheckoutEmail,
};
