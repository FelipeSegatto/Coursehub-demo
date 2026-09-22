const express = require("express");
const db = require("../db");
const { contactRequestByIpRateLimiter, contactRequestByEmailRateLimiter } = require("../middlewares/rateLimiters");
const { createContactRequest } = require("../services/public/publicContactService");

const router = express.Router();

/**
 * POST /api/public/contact
 * Formulário público de contato (ContactPage.jsx) -- sem
 * autenticação. Persiste primeiro, notifica admins depois (dentro do
 * próprio service); uma falha ao notificar nunca impede a resposta de
 * sucesso, já que a mensagem já foi salva.
 */
router.post("/contact", contactRequestByIpRateLimiter, contactRequestByEmailRateLimiter, async (req, res) => {
  try {
    const result = await createContactRequest(db, req.body || {});

    return res.status(201).json({
      message: "Mensagem enviada com sucesso. Em breve entraremos em contato.",
      data: result,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    console.error("Erro ao registrar contato público:", error.message);

    return res.status(500).json({ message: "Não foi possível enviar sua mensagem. Tente novamente em instantes." });
  }
});

module.exports = router;
