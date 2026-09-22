/**
 * Checkout público de curso -- sessão/verificação de e-mail (esta
 * parte) + submissão final do contrato (submitPublicCheckoutContract,
 * ver publicCheckoutService.js).
 */
const express = require("express");
const db = require("../db");
const {
  publicCheckoutSessionRateLimiter,
  checkoutEmailVerificationRateLimiter,
  checkoutContractSubmitRateLimiter,
} = require("../middlewares/rateLimiters");
const {
  startPublicCheckoutSession,
  getCheckoutSessionStatus,
  validateCheckoutEmailToken,
  verifyCheckoutEmail,
} = require("../services/financial/publicCheckoutSessionService");
const { submitPublicCheckoutContract } = require("../services/financial/publicCheckoutService");
const { setInvoicePaymentSessionCookie } = require("../utils/cookies");
const { INVOICE_PAYMENT_SESSION_TTL_MINUTES } = require("../config/checkoutConfig");

const router = express.Router();

router.post("/sessions", publicCheckoutSessionRateLimiter, async (req, res) => {
  try {
    const { courseId, pricingPlanId, email } = req.body || {};

    const result = await startPublicCheckoutSession(db, { courseId, pricingPlanId, email });

    return res.status(201).json({ data: result });
  } catch (error) {
    console.error("Erro ao iniciar sessão de checkout público:", error);

    return res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Não foi possível iniciar o checkout.",
    });
  }
});

router.get("/sessions/:checkoutToken", async (req, res) => {
  try {
    const result = await getCheckoutSessionStatus(db, req.params.checkoutToken);

    return res.status(200).json({ data: result });
  } catch (error) {
    console.error("Erro ao consultar sessão de checkout público:", error.message);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Não foi possível consultar a sessão.",
    });
  }
});

router.get("/verify-email/validate", checkoutEmailVerificationRateLimiter, async (req, res) => {
  try {
    const result = await validateCheckoutEmailToken(db, req.query.token);

    return res.status(200).json(result);
  } catch (error) {
    console.error("Erro ao validar token de verificação de e-mail:", error.message);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Não foi possível validar o link de verificação.",
    });
  }
});

router.post("/verify-email", checkoutEmailVerificationRateLimiter, async (req, res) => {
  try {
    const result = await verifyCheckoutEmail(db, req.body?.token);

    return res.status(200).json(result);
  } catch (error) {
    console.error("Erro ao confirmar e-mail de checkout:", error.message);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Não foi possível confirmar o e-mail.",
    });
  }
});

/**
 * POST /api/public/checkout/sessions/:checkoutToken/contract
 * Submissão final da etapa 5 do wizard -- cria aluno/contratante/
 * contrato/invoice/aceite e inicia o pagamento. Ver
 * publicCheckoutService.js para o comportamento completo, incluindo o
 * caso de falha do gateway (contrato/invoice preservados, nunca
 * duplicados).
 */
router.post("/sessions/:checkoutToken/contract", checkoutContractSubmitRateLimiter, async (req, res) => {
  try {
    const result = await submitPublicCheckoutContract(db, {
      checkoutToken: req.params.checkoutToken,
      ...req.body,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    // O token de sessão só existe no cookie HTTP-only -- nunca no
    // corpo da resposta JSON (o frontend não precisa dele
    // diretamente, só do cookie que a próxima chamada já envia
    // sozinha).
    const { invoiceSessionToken, invoiceSessionExpiresAt, ...publicResult } = result;

    if (invoiceSessionToken) {
      setInvoicePaymentSessionCookie(res, invoiceSessionToken, {
        maxAgeMs: INVOICE_PAYMENT_SESSION_TTL_MINUTES * 60 * 1000,
      });
    }

    return res.status(201).json({ data: publicResult });
  } catch (error) {
    console.error("Erro ao concluir checkout público:", error);

    return res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Não foi possível concluir a contratação.",
    });
  }
});

module.exports = router;
