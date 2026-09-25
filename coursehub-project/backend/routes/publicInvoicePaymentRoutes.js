const {
  processGatewayPaymentUpdate,
} = require(
  "../services/financial/paymentProcessingService"
);

/**
 * Checkout privado de invoice -- link seguro para um contratante
 * (com ou sem conta CourseHub) pagar uma cobrança específica sem
 * login. Todo acesso passa primeiro por uma troca de token por sessão
 * (POST /session); as demais rotas dependem só do cookie
 * HTTP-only resultante (requireInvoicePaymentSession), nunca de um
 * invoiceId enviado pelo cliente.
 */
const express = require("express");
const db = require("../db");
const { allowsSimulatedPayments } = require("../services/paymentGateway/demoGatewayPolicy");
const requireInvoicePaymentSession = require("../middlewares/requireInvoicePaymentSession");
const {
  invoicePaymentLinkAccessRateLimiter,
  publicInvoicePaymentCreateRateLimiter,
  invoicePaymentLinkRecoveryByIpRateLimiter,
  invoicePaymentLinkRecoveryByEmailRateLimiter,
} = require("../middlewares/rateLimiters");
const {
  exchangeInvoicePaymentToken,
  getInvoicePaymentSessionSnapshot,
} = require("../services/financial/invoicePaymentAccessService");
const {
  requestInvoicePaymentLinkByEmail,
} = require("../services/financial/invoicePaymentLinkRecoveryService");
const {
  startInvoicePayment,
  getInvoicePaymentByAccessContext,
} = require("../services/financial/invoicePaymentService");
const { openPurchasedCourseAccess } = require("../services/financial/purchasedCourseAccessService");
const {
  setInvoicePaymentSessionCookie,
} = require("../utils/cookies");
const { INVOICE_PAYMENT_SESSION_TTL_MINUTES } = require("../config/checkoutConfig");

const router = express.Router();

/**
 * POST /api/public/invoice-payment/session
 * Troca o token bruto do link (enviado só nesta chamada, uma única
 * vez) por uma sessão curta -- o frontend remove o token da URL
 * (history.replaceState) assim que esta chamada retorna.
 */
router.post("/session", invoicePaymentLinkAccessRateLimiter, async (req, res) => {
  try {
    const { token } = req.body || {};

    const { rawSessionToken, expiresAt } = await exchangeInvoicePaymentToken(db, token);

    setInvoicePaymentSessionCookie(res, rawSessionToken, {
      maxAgeMs: INVOICE_PAYMENT_SESSION_TTL_MINUTES * 60 * 1000,
    });

    res.set("Cache-Control", "no-store");

    return res.status(200).json({ expiresAt });
  } catch (error) {
    console.error("Erro ao trocar token de pagamento de fatura:", error.message);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Não foi possível abrir o link de pagamento.",
    });
  }
});

/**
 * GET /api/public/invoice-payment/me
 * Leitura mínima autorizada só pela sessão -- nunca aceita um
 * invoiceId vindo do cliente.
 */
router.get("/me", requireInvoicePaymentSession, async (req, res) => {
  try {
    const snapshot = await getInvoicePaymentSessionSnapshot(db, req.invoicePaymentSession.invoiceId);

    res.set("Cache-Control", "no-store");

    return res.status(200).json({ data: snapshot });
  } catch (error) {
    console.error("Erro ao consultar cobrança via link privado:", error.message);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Não foi possível carregar a cobrança.",
    });
  }
});

/**
 * POST /api/public/invoice-payment/payments
 * Inicia (ou reaproveita) uma tentativa de pagamento para a invoice da
 * sessão -- mesmo motor central usado pelo checkout autenticado e
 * público (startInvoicePayment), que sempre relê a invoice do banco e
 * recusa qualquer tentativa nova se ela já estiver paid/cancelled/
 * refunded.
 */
router.post("/payments", requireInvoicePaymentSession, publicInvoicePaymentCreateRateLimiter, async (req, res) => {
  try {
    const { paymentMethod, cardToken, cardInstallments, cardPaymentMethodId } = req.body || {};

    const result = await startInvoicePayment(db, {
      invoiceId: req.invoicePaymentSession.invoiceId,
      paymentMethod,
      cardToken,
      cardInstallments,
      cardPaymentMethodId,
      accessContext: { scope: "invoice", invoiceId: req.invoicePaymentSession.invoiceId },
    });

    return res.status(201).json({ data: result });
  } catch (error) {
    console.error("Erro ao iniciar pagamento via link privado:", error.message);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Não foi possível iniciar o pagamento.",
    });
  }
});

/**
 * GET /api/public/invoice-payment/payments/:paymentId
 * Usado pelo polling da tela de pagamento -- ownership sempre
 * verificado contra req.invoicePaymentSession.invoiceId, nunca contra
 * algo enviado pelo cliente além do próprio paymentId na URL.
 */
router.get(
  "/payments/:paymentId",
  requireInvoicePaymentSession,
  async (req, res) => {
    try {
      const paymentId =
        Number(req.params.paymentId);

      if (
        !Number.isInteger(paymentId) ||
        paymentId <= 0
      ) {
        return res.status(400).json({
          message:
            "Identificador de pagamento inválido.",
        });
      }

      const accessContext = {
        scope: "invoice",
        invoiceId:
          req.invoicePaymentSession.invoiceId,
      };


      /*
       * =====================================================
       * 1. LÊ O PAGAMENTO LOCAL
       * =====================================================
       */
      let payment =
        await getInvoicePaymentByAccessContext(
          db,
          {
            paymentId,
            accessContext,
          }
        );


      /*
       * =====================================================
       * 2. DEV + GATEWAY SIMULADO
       * =====================================================
       *
       * No gateway real, a atualização normalmente chega
       * pelo webhook.
       *
       * O gateway simulado não possui servidor externo nem
       * webhook real.
       *
       * Portanto, durante o polling em desenvolvimento,
       * sincronizamos explicitamente o estado do gateway.
       */
      if (allowsSimulatedPayments() && payment.status === "pending") {
        try {
          const [
            rows,
          ] =
            await db
              .promise()
              .query(
                `
                  SELECT
                    gateway,
                    gateway_payment_id
                  FROM payments
                  WHERE id = ?
                  LIMIT 1
                `,
                [paymentId]
              );


          const storedPayment =
            rows[0];


          if (
            storedPayment?.gateway ===
              "simulated" &&
            storedPayment
              ?.gateway_payment_id
          ) {

            /*
             * Mesmo pipeline usado pelo webhook.
             *
             * Ele consulta o gateway,
             * valida transição,
             * atualiza payment,
             * invoice,
             * contrato,
             * matrícula etc.
             */
            await processGatewayPaymentUpdate(
              db,
              {
                gateway:
                  "simulated",

                gatewayPaymentId:
                  storedPayment
                    .gateway_payment_id,

                gatewayEventId:
                  null,

                source:
                  "simulated_gateway",
              }
            );

            /*
             * Relê depois da sincronização.
             */
            payment =
              await getInvoicePaymentByAccessContext(
                db,
                {
                  paymentId,
                  accessContext,
                }
              );
          }

        } catch (syncError) {

          /*
           * Não quebramos o polling inteiro
           * por uma falha temporária de sync.
           */
          console.error(
            "[publicInvoicePaymentRoutes] " +
            "erro ao sincronizar gateway simulado:",
            syncError.message
          );
        }
      }


      res.set(
        "Cache-Control",
        "no-store"
      );


      return res.status(200).json({
        data: payment,
      });

    } catch (error) {

      console.error(
        "Erro ao consultar pagamento público:",
        error.message
      );


      return res
        .status(
          error.statusCode || 500
        )
        .json({
          message:
            error.message ||
            "Não foi possível consultar o pagamento.",
        });
    }
  }
);

/**
 * POST /api/public/invoice-payment/payments/:paymentId/course-access
 * Checkout público da demo: com o pagamento aprovado e o cookie da
 * fatura, devolve o caminho para ativar a conta e entrar no curso.
 */
router.post("/payments/:paymentId/course-access", requireInvoicePaymentSession, async (req, res) => {
  try {
    const paymentId = Number(req.params.paymentId);

    if (!Number.isInteger(paymentId) || paymentId <= 0) {
      return res.status(400).json({ message: "Identificador de pagamento inválido." });
    }

    const result = await openPurchasedCourseAccess(db, {
      paymentId,
      accessContext: req.invoicePaymentSession,
    });

    return res.status(200).json({ data: result });
  } catch (error) {
    console.error("Erro ao abrir acesso ao curso comprado:", error.message);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Não foi possível abrir o acesso ao curso.",
    });
  }
});

/**
 * POST /api/public/invoice-payment/request-link
 * "Não encontrou seu link?" (Fale conosco) -- recebe só um e-mail,
 * nunca invoiceId. Sempre responde a mesma mensagem genérica, exista
 * ou não uma fatura elegível para esse e-mail, para não vazar se o
 * endereço tem cadastro/contrato/fatura (mesmo princípio de
 * /api/forgot-password/check-email).
 */
router.post(
  "/request-link",
  invoicePaymentLinkRecoveryByIpRateLimiter,
  invoicePaymentLinkRecoveryByEmailRateLimiter,
  async (req, res) => {
    const genericResponse = {
      message: "Se houver uma cobrança disponível para este e-mail, enviaremos as instruções de acesso.",
    };

    try {
      await requestInvoicePaymentLinkByEmail(db, req.body || {});

      return res.status(200).json(genericResponse);
    } catch (error) {
      if (error.statusCode === 400) {
        return res.status(400).json({ message: error.message });
      }

      console.error("Erro ao processar solicitação de link de fatura:", error.message);

      // Qualquer outro erro ainda responde com a mensagem genérica.
      return res.status(200).json(genericResponse);
    }
  }
);

module.exports = router;
