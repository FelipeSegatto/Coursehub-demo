const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");

const { getPaymentGatewayName, resolveGatewayByName } = require("../services/paymentGateway/paymentGatewayFactory");
const { processGatewayPaymentUpdate } = require("../services/financial/paymentProcessingService");

const router = express.Router();

/**
 * POST /api/webhooks/payments/mercado-pago
 *
 * Pública por design -- este é o endpoint que o próprio Mercado Pago
 * chama, então não pode exigir o cookie JWT de aluno/admin
 * (authenticateToken deliberadamente NÃO é usado aqui). A
 * autenticidade é estabelecida, em vez disso, por verifyWebhook()
 * (assinatura HMAC sobre headers + o parâmetro de query `data.id`,
 * via o WebhookSignatureValidator do próprio SDK -- ver
 * mercadoPagoGateway.js).
 *
 * Nota da seção 24 (raw body vs express.json()): a assinatura do
 * Mercado Pago é calculada sobre
 * `id:{data.id};request-id:{x-request-id};ts:{ts};` -- headers e a
 * query string, nunca os bytes do corpo da requisição (confirmado
 * lendo a implementação real do próprio validador do SDK instalado,
 * não presumido). O `express.json()` global em server.js portanto
 * continua seguro como estava para esta rota; não há necessidade de
 * corpo bruto (raw body) a tratar aqui.
 *
 * Nenhum rate limiter nesta rota de propósito (seção 36): um limiter
 * calibrado para um humano clicando "pagar" também limitaria o
 * próprio comportamento de reenvio-até-200 do Mercado Pago, que é
 * exatamente o tráfego que este endpoint nunca pode rejeitar.
 */
router.post("/webhooks/payments/mercado-pago", async (req, res) => {
  const gateway = "mercado_pago";
  const gatewayInstance = resolveGatewayByName(gateway);

  try {
    gatewayInstance.verifyWebhook({ headers: req.headers, query: req.query });
  } catch (error) {
    console.warn("[paymentWebhookRoutes] rejected webhook with invalid signature", {
      code: error.code,
      requestId: req.headers["x-request-id"],
    });

    return res.status(401).json({ message: "Assinatura inválida." });
  }

  const { gatewayPaymentId, gatewayEventId } = gatewayInstance.parseWebhook({
    headers: req.headers,
    query: req.query,
    body: req.body,
  });

  if (!gatewayPaymentId) {
    // Não é uma notificação do tipo "payment" (o Mercado Pago envia
    // outros tópicos também, ex.: merchant_order) -- nada a fazer
    // aqui, apenas confirmar o recebimento e seguir.
    return res.status(200).json({ received: true, ignored: true });
  }

  try {
    const result = await processGatewayPaymentUpdate(db, {
      gateway,
      gatewayPaymentId,
      gatewayEventId,
      source: "gateway_webhook",
    });

    return res.status(200).json({ received: true, ...result });
  } catch (error) {
    console.error("[paymentWebhookRoutes] error processing webhook", {
      gatewayPaymentId,
      message: error.message,
    });

    // Seção 35: uma falha transitória aqui (deadlock que foi
    // tentado de novo e mesmo assim falhou, um soluço no banco)
    // deve deixar o Mercado Pago reenviar a entrega em vez de
    // engolir o erro silenciosamente -- 500 é o sinal correto para
    // "tente de novo", diferente dos 200 acima, que representam uma
    // decisão deliberada e já final.
    return res.status(500).json({ message: "Erro ao processar notificação." });
  }
});

/**
 * POST /api/webhooks/payments/simulated/:paymentId/approve
 *
 * Auxiliar exclusivo para desenvolvimento/teste que faz o papel de
 * "o Mercado Pago enviou um webhook de aprovação" para o gateway
 * simulado, que não tem transporte HTTP real próprio. Travado com
 * segurança fora de NODE_ENV!==production E
 * PAYMENT_GATEWAY=simulated -- isto NÃO é um backdoor genérico de
 * "definir status de pagamento" (seção 78): ele só consegue alterar
 * o próprio registro em memória do gateway SIMULADO e, em seguida,
 * passa pelo mesmo pipeline processGatewayPaymentUpdate() que um
 * webhook real usa (o limite de confiança equivalente à assinatura é
 * simplesmente "você é um usuário autenticado deste ambiente de
 * dev").
 */
router.post("/webhooks/payments/simulated/:paymentId/approve", authenticateToken, async (req, res) => {
  if (process.env.NODE_ENV === "production" || getPaymentGatewayName() !== "simulated") {
    return res.status(404).json({ message: "Não encontrado." });
  }

  try {
    const paymentId = Number(req.params.paymentId);

    if (!Number.isInteger(paymentId) || paymentId <= 0) {
      return res.status(400).json({ message: "Identificador de pagamento inválido." });
    }

    const [rows] = await db
      .promise()
      .query(`SELECT gateway, gateway_payment_id, status FROM payments WHERE id = ? LIMIT 1`, [paymentId]);

    const payment = rows[0];

    if (!payment || payment.gateway !== "simulated") {
      return res.status(404).json({ message: "Pagamento simulado não encontrado." });
    }

    if (payment.status !== "pending" && payment.status !== "created") {
      return res.status(409).json({ message: "Este pagamento não está mais aguardando aprovação." });
    }

    const simulatedGateway = resolveGatewayByName("simulated");

    simulatedGateway.simulateApproval(payment.gateway_payment_id);

    const result = await processGatewayPaymentUpdate(db, {
      gateway: "simulated",
      gatewayPaymentId: payment.gateway_payment_id,
      gatewayEventId: null,
      source: "simulated_gateway",
    });

    return res.status(200).json({ received: true, ...result });
  } catch (error) {
    console.error("[paymentWebhookRoutes] error simulating approval", { message: error.message });

    return res.status(500).json({ message: "Não foi possível simular a aprovação." });
  }
});

module.exports = router;
