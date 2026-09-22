const {
  MercadoPagoConfig,
  Payment,
  PaymentRefund,
  WebhookSignatureValidator,
  InvalidWebhookSignatureError,
} = require("mercadopago");

const { formatDateTimeForMySQL } = require("./paymentGatewayContract");

// Um MercadoPagoConfig novo a cada chamada é proposital, não descuido:
// é um objeto simples e barato (sem abertura de socket/conexão), e
// ler o access token de forma preguiçosa -- em vez de guardá-lo em
// cache no carregamento do módulo -- faz uma credencial
// ausente/mal configurada falhar só na requisição específica que
// precisava dela, não no processo inteiro no require() (server.js já
// falha duro no boot se o gateway estiver mal configurado; esta é a
// segunda linha de defesa, no escopo da própria requisição).
function getConfig() {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error("MERCADO_PAGO_ACCESS_TOKEN não está configurado.");
  }

  return new MercadoPagoConfig({ accessToken, options: { timeout: 8000 } });
}

/**
 * Os valores de payment.status do próprio Mercado Pago (approved,
 * rejected, cancelled, refunded, charged_back, pending, in_process,
 * authorized, in_mediation) nunca são usados como status do
 * CourseHub diretamente -- este é o único lugar que os traduz para o
 * vocabulário da máquina de estados do domínio
 * (paymentStateMachine.js). pending/in_process/authorized/
 * in_mediation todos colapsam para "pending": nenhum deles
 * representa dinheiro que o CourseHub já pode agir sobre.
 *
 * NÃO existe um valor "expired" aqui de propósito, não por descuido:
 * o Mercado Pago não expõe um `payment.status` top-level distinto
 * para PIX/boleto vencido -- confirmado tanto pelo contrato já
 * documentado acima (GatewayPaymentResult.status só documenta
 * "pending"|"approved"|"rejected"|"cancelled") quanto pelo próprio
 * `.d.ts` do SDK instalado (`clients/payment/commonTypes.d.ts`), cujo
 * comentário de `status` só exemplifica approved/pending/rejected/
 * cancelled. Na prática o provider representa "PIX/boleto vencido sem
 * pagamento" como `status: "cancelled"` com `status_detail`
 * carregando o motivo -- já preservado sem perda em
 * gateway_status/gateway_status_detail por mapPaymentResponse abaixo.
 * O conceito de tentativa "expired" do CourseHub (ver
 * invoicePaymentService.js#expireDuePaymentAttempts) é, portanto,
 * puramente local/lazy -- baseado em pix_expires_at/boleto_due_date
 * já salvos aqui, não em uma notificação do gateway -- e não depende
 * deste normalizeStatus. Se o Mercado Pago um dia passar a emitir um
 * status distinto e documentado para isso, mapeie-o explicitamente
 * aqui em vez de deixá-lo continuar caindo no default abaixo.
 */
function normalizeStatus(gatewayStatus) {
  switch (gatewayStatus) {
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "cancelled":
      return "cancelled";
    case "refunded":
      return "refunded";
    case "charged_back":
      return "chargeback";
    case "pending":
    case "in_process":
    case "authorized":
    case "in_mediation":
    default:
      return "pending";
  }
}

/**
 * Mapeia a resposta bruta do Mercado Pago para o resultado
 * normalizado do domínio -- campos de boleto/cartão só são
 * preenchidos quando `response.payment_type_id` indica esse método
 * ("ticket" = boleto, "credit_card" = cartão), os demais ficam null,
 * igual ao pix já fazia antes desta generalização.
 */
function mapPaymentResponse(response) {
  const transactionData = response.point_of_interaction?.transaction_data || {};
  const status = normalizeStatus(response.status);
  const isBoleto = response.payment_type_id === "ticket";
  const isCard = response.payment_type_id === "credit_card";

  return {
    gatewayPaymentId: response.id !== undefined && response.id !== null ? String(response.id) : null,
    status,
    gatewayStatus: response.status || null,
    gatewayStatusDetail: response.status_detail || null,
    failureCode: status === "rejected" ? response.status_detail || null : null,
    pixCopyPaste: transactionData.qr_code || null,
    pixQrCode: transactionData.qr_code_base64 || null,
    pixExpiresAt: response.date_of_expiration ? formatDateTimeForMySQL(response.date_of_expiration) : null,
    boletoBarcode: isBoleto ? response.barcode?.content || null : null,
    boletoUrl: isBoleto ? response.transaction_details?.external_resource_url || null : null,
    boletoDueDate: isBoleto && response.date_of_expiration
      ? formatDateTimeForMySQL(response.date_of_expiration)
      : null,
    cardBrand: isCard ? response.payment_method_id || null : null,
    cardLastFour: isCard ? response.card?.last_four_digits || null : null,
    cardInstallments: isCard ? response.installments || null : null,
    paidAt: response.date_approved ? formatDateTimeForMySQL(response.date_approved) : null,
    amount: response.transaction_amount ?? null,
    currency: response.currency_id || null,
    externalReference: response.external_reference || null,
  };
}

/**
 * Cria um pagamento via POST /v1/payments -- pix, boleto ou cartão.
 *
 * pix e boleto nunca envolvem dado sensível: boleto só precisa de
 * identificação do pagador (CPF/CNPJ), igual a qualquer emissão de
 * boleto bancário.
 *
 * cartão (credit_card) só recebe `cardToken` -- o token de uso único
 * que o Card Payment Brick do próprio Mercado Pago gera NO NAVEGADOR
 * do pagador (ver coursehub/src/components/payment/CreditCardPaymentPanel.jsx),
 * nunca dado bruto de cartão. O CourseHub não vê nem processa PAN,
 * CVV ou validade em nenhum momento -- só repassa o token recebido do
 * frontend para o campo `token` da API do Mercado Pago, exatamente
 * como a documentação oficial de Checkout API exige.
 *
 * IMPORTANTE (risco residual documentado): os branches de boleto e
 * cartão abaixo foram implementados a partir do formato documentado
 * da API do Mercado Pago, mas não puderam ser verificados ao vivo
 * contra um sandbox real neste ambiente (sem credenciais/rede). O
 * branch de pix continua sendo o único verificado ponta a ponta em
 * produção. Ver docs/features/payment-gateway.md e o relatório final
 * desta missão para o risco residual completo antes de habilitar
 * boleto/cartão reais.
 */
async function createPayment({
  paymentMethod,
  amount,
  description,
  externalReference,
  idempotencyKey,
  payer,
  cardToken,
  cardInstallments,
  cardPaymentMethodId,
  notificationUrl,
}) {
  const client = new Payment(getConfig());

  const basePayer = {
    email: payer.email,
    first_name: payer.firstName || undefined,
    last_name: payer.lastName || undefined,
    identification:
      payer.documentType && payer.documentNumber
        ? { type: payer.documentType.toUpperCase(), number: payer.documentNumber }
        : undefined,
  };

  let body;

  if (paymentMethod === "pix") {
    body = {
      transaction_amount: Number(amount),
      description,
      payment_method_id: "pix",
      external_reference: externalReference,
      notification_url: notificationUrl || undefined,
      payer: basePayer,
    };
  } else if (paymentMethod === "boleto") {
    body = {
      transaction_amount: Number(amount),
      description,
      payment_method_id: "bolbradesco",
      external_reference: externalReference,
      notification_url: notificationUrl || undefined,
      payer: basePayer,
    };
  } else if (paymentMethod === "credit_card") {
    if (!cardToken) {
      throw new Error("Token de cartão é obrigatório para pagamento com cartão.");
    }

    body = {
      transaction_amount: Number(amount),
      description,
      token: cardToken,
      payment_method_id: cardPaymentMethodId,
      installments: cardInstallments ? Number(cardInstallments) : 1,
      external_reference: externalReference,
      notification_url: notificationUrl || undefined,
      payer: basePayer,
    };
  } else {
    throw new Error(`O adaptador do Mercado Pago não suporta o método de pagamento "${paymentMethod}".`);
  }

  const response = await client.create({ body, requestOptions: { idempotencyKey } });

  return mapPaymentResponse(response);
}

/** GET /v1/payments/:id -- a fonte da verdade autoritativa, sempre buscada de novo em vez de confiar no corpo de um webhook. */
async function getPayment(gatewayPaymentId) {
  const client = new Payment(getConfig());
  const response = await client.get({ id: gatewayPaymentId });

  return mapPaymentResponse(response);
}

/**
 * POST /v1/payments/:id/refunds. Um reembolso recusado/com erro é
 * reportado como { status: "failed" } em vez de lançar exceção -- o
 * chamador (paymentRefundService) decide o que isso significa para o
 * registro local; ele nunca pode marcar um pagamento como
 * reembolsado localmente quando o provider recusou.
 */
async function refundPayment({ gatewayPaymentId, amount }) {
  const client = new PaymentRefund(getConfig());

  try {
    const response = await client.create({
      payment_id: gatewayPaymentId,
      body: amount ? { amount: Number(amount) } : undefined,
    });

    return {
      status: "refunded",
      gatewayRefundId: response.id !== undefined && response.id !== null ? String(response.id) : null,
    };
  } catch (error) {
    return { status: "failed", failureReason: error.message || "gateway_refund_error" };
  }
}

/**
 * Verifica o header `x-signature` usando o próprio
 * WebhookSignatureValidator do SDK (HMAC-SHA256 sobre
 * "id:{data.id};request-id:{x-request-id};ts:{ts};", comparado em
 * tempo constante) -- confirmado contra a implementação real do SDK
 * instalado, não reimplementado manualmente. Deliberadamente síncrono
 * e sem efeito colateral: nenhum acesso ao banco, então um atacante é
 * rejeitado antes de qualquer lógica de negócio rodar.
 */
function verifyWebhook({ headers, query }) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error("MERCADO_PAGO_WEBHOOK_SECRET não está configurado.");
  }

  try {
    WebhookSignatureValidator.validate({
      xSignature: headers["x-signature"],
      xRequestId: headers["x-request-id"],
      dataId: query["data.id"],
      secret,
      // Rejeita uma assinatura cujo timestamp esteja a mais de 5
      // minutos de distância de agora -- estreita a janela de replay
      // de uma notificação capturada mas, de resto, válida.
      toleranceSeconds: 300,
    });
  } catch (error) {
    if (error instanceof InvalidWebhookSignatureError) {
      const wrapped = new Error(`Assinatura de webhook do Mercado Pago inválida: ${error.reason}`);
      wrapped.code = "INVALID_WEBHOOK_SIGNATURE";
      throw wrapped;
    }

    throw error;
  }
}

/**
 * Extrai somente os identificadores necessários para localizar o
 * pagamento local e deduplicar o evento -- nunca os campos de
 * status/valor da própria notificação, que paymentProcessingService
 * sempre busca de novo via getPayment() em vez de confiar.
 *
 * gatewayEventId é a chave de payment_events.gateway_event_id
 * (UNIQUE): o "id" do topo da notificação é estável entre os
 * reenvios do Mercado Pago da *mesma* entrega (ele reenvia
 * notificações idênticas quando não respondemos 200 rapidamente) e
 * distinto entre eventos genuinamente diferentes (ex.: pending ->
 * approved é uma notificação nova, com um id novo) -- exatamente a
 * chave de deduplicação para a qual essa coluna existe.
 */
function parseWebhook({ query, body }) {
  const type = query.type || query.topic || body?.type;
  const dataId = query["data.id"] || body?.data?.id;

  if (type !== "payment" || !dataId) {
    return { gatewayPaymentId: null, gatewayEventId: null };
  }

  const notificationId = body?.id ?? null;

  return {
    gatewayPaymentId: String(dataId),
    gatewayEventId: notificationId !== null ? `mercado_pago:${notificationId}` : null,
  };
}

module.exports = {
  createPayment,
  getPayment,
  refundPayment,
  verifyWebhook,
  parseWebhook,
};
