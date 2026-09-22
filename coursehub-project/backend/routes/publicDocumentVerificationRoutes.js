const express = require("express");
const db = require("../db");
const { documentVerificationRateLimiter } = require("../middlewares/rateLimiters");
const { verifyByCode } = require("../services/academic/documentVerificationService");

const router = express.Router();

/**
 * GET /api/public/documents/verify/:code
 * Sem autenticação -- qualquer pessoa pode conferir um certificado/
 * declaração pelo código impresso/QR. Retorna só o mínimo (nunca CPF,
 * e-mail, IDs internos, notas ou frequência detalhada) --
 * verifyByCode já garante isso, esta rota só expõe o resultado.
 */
router.get("/verify/:code", documentVerificationRateLimiter, async (req, res) => {
  try {
    const result = await verifyByCode(db, req.params.code);

    res.set("Cache-Control", "no-store");

    return res.status(200).json({ data: result });
  } catch (error) {
    console.error("Erro ao verificar documento:", error);

    return res.status(500).json({ message: "Erro interno ao verificar o documento." });
  }
});

module.exports = router;
