/**
 * Contrato compartilhado por todo adaptador de gateway de pagamento
 * (simulatedGateway.js, mercadoPagoGateway.js e qualquer provider
 * futuro). O restante da aplicação (studentPaymentService,
 * paymentProcessingService, paymentRefundService, a rota de webhook)
 * só chama esses cinco métodos -- nunca decide qual provider está
 * ativo. Essa decisão acontece em um único lugar,
 * paymentGatewayFactory.js.
 *
 * Todo campo monetário é um número JS simples na unidade da moeda da
 * fatura (ex.: 149.90), igual ao resto do módulo financeiro já lida
 * com colunas DECIMAL(10,2) -- cada gateway converte internamente
 * para a unidade que a própria API do provider espera.
 *
 * @typedef {Object} GatewayPayer
 * @property {string} email
 * @property {string} [firstName]
 * @property {string} [lastName]
 * @property {string} [documentType] - "cpf" (por enquanto o único emitido pelo domínio), obrigatório na prática para boleto/cartão.
 * @property {string} [documentNumber]
 *
 * @typedef {Object} CreatePaymentInput
 * @property {number} paymentId - payments.id da tentativa (já inserida com status 'created').
 * @property {number} invoiceId
 * @property {"pix"|"boleto"|"credit_card"} paymentMethod
 * @property {number} amount - fonte da verdade: lido de invoices.amount pelo chamador, nunca do cliente.
 * @property {string} currency - ISO 4217, "BRL".
 * @property {string} description
 * @property {string} externalReference - "invoice:{invoiceId}:payment:{paymentId}".
 * @property {string} idempotencyKey - estável por tentativa; um retry precisa reutilizá-la, nunca gerar uma nova.
 * @property {GatewayPayer} payer
 * @property {string} [cardToken] - só para paymentMethod "credit_card": token de uso único gerado NO NAVEGADOR pelo SDK do gateway (nunca dado bruto de cartão).
 * @property {number} [cardInstallments] - só para "credit_card".
 * @property {string} [cardPaymentMethodId] - só para "credit_card": bandeira identificada pelo SDK do gateway no navegador (ex.: "visa", "master").
 * @property {string} [notificationUrl] - URL do webhook, só faz sentido para gateways reais.
 *
 * @typedef {Object} GatewayPaymentResult
 * @property {string} gatewayPaymentId - identificador do próprio provider. Nunca inventado para um gateway real.
 * @property {"pending"|"approved"|"rejected"|"cancelled"} status - status normalizado no domínio do CourseHub.
 * @property {string} [gatewayStatus] - status bruto do provider, guardado como veio para auditoria/troubleshooting.
 * @property {string} [gatewayStatusDetail]
 * @property {string} [failureCode]
 * @property {string} [pixCopyPaste]
 * @property {string} [pixQrCode] - imagem do QR Code em base64 (ou um marcador simulado em dev).
 * @property {string} [pixExpiresAt] - "YYYY-MM-DD HH:mm:ss", formato DATETIME do MySQL.
 * @property {string} [boletoBarcode] - linha digitável/código de barras do boleto.
 * @property {string} [boletoUrl] - link para visualizar/imprimir o boleto.
 * @property {string} [boletoDueDate] - "YYYY-MM-DD HH:mm:ss", vencimento do boleto emitido pelo gateway.
 * @property {string} [cardBrand] - bandeira do cartão conforme identificada pelo gateway (nunca inferida pelo CourseHub).
 * @property {string} [cardLastFour] - só os 4 últimos dígitos, exatamente como o gateway devolve -- nunca o PAN completo.
 * @property {number} [cardInstallments]
 * @property {string} [paidAt] - "YYYY-MM-DD HH:mm:ss", preenchido só quando status já é "approved".
 *
 * @typedef {Object} GatewayRefundResult
 * @property {"refunded"|"failed"} status
 * @property {string} [gatewayRefundId]
 * @property {string} [failureReason]
 */

/**
 * Contrato (apenas documentação -- JS não tem interfaces). Um módulo
 * de gateway concreto exporta funções simples com essas assinaturas,
 * não precisa estender esta classe. Ela existe só para dar um lugar
 * canônico para apontar "implementa o contrato".
 */
class PaymentGatewayContract {
  /** @param {CreatePaymentInput} input @returns {Promise<GatewayPaymentResult>} */
  async createPayment(input) {
    throw new Error("createPayment not implemented");
  }

  /** @param {string} gatewayPaymentId @returns {Promise<GatewayPaymentResult>} */
  async getPayment(gatewayPaymentId) {
    throw new Error("getPayment not implemented");
  }

  /** @param {{gatewayPaymentId: string, amount?: number}} input @returns {Promise<GatewayRefundResult>} */
  async refundPayment(input) {
    throw new Error("refundPayment not implemented");
  }

  /**
   * Lança erro quando o webhook recebido não pode ser autenticado.
   * Nunca deve tocar o banco de dados -- verificação pura de
   * assinatura contra headers/query, para que
   * paymentProcessingService possa rejeitar uma requisição forjada
   * antes de fazer qualquer trabalho.
   */
  verifyWebhook(_request) {
    throw new Error("verifyWebhook not implemented");
  }

  /**
   * Extrai somente os identificadores necessários para localizar o
   * pagamento local e deduplicar o evento -- deliberadamente NÃO o
   * status/valor do provider, que sempre precisa ser buscado de novo
   * via getPayment() em vez de confiado a partir do corpo da
   * notificação.
   * @returns {{gatewayPaymentId: string|null, gatewayEventId: string|null}}
   */
  parseWebhook(_request) {
    throw new Error("parseWebhook not implemented");
  }
}

/** Referência externa enviada ao provider, ex.: "invoice:44:payment:118". */
function buildExternalReference({ invoiceId, paymentId }) {
  return `invoice:${invoiceId}:payment:${paymentId}`;
}

/** Chave de idempotência de uma tentativa de pagamento -- estável entre retries da mesma tentativa. */
function buildIdempotencyKey({ paymentId }) {
  return `coursehub-payment-${paymentId}`;
}

/**
 * Formata uma Date (ou valor de data interpretável) como uma string
 * DATETIME do MySQL usando componentes de horário LOCAL -- espelha
 * paymentService.js#normalizePaymentDate e o formatDateOnly de
 * appConfig.js, que leem os getters da Date localmente em vez de
 * toISOString() (que é UTC e faria a data derivar silenciosamente
 * pelo offset UTC do servidor assim que o mysql2 lesse a coluna de
 * volta como uma Date local ao processo).
 */
function formatDateTimeForMySQL(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const pad = (n) => String(n).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

module.exports = {
  PaymentGatewayContract,
  buildExternalReference,
  buildIdempotencyKey,
  formatDateTimeForMySQL,
};
