const crypto = require("crypto");
const QRCode = require("qrcode");
const { allowsSimulatedPayments } = require("./demoGatewayPolicy");

const {
  formatDateTimeForMySQL,
} = require("./paymentGatewayContract");

function shouldAutoApproveSimulatedPayment() {
  if (!allowsSimulatedPayments()) {
    return false;
  }

  const flag = String(process.env.SIMULATED_PAYMENT_AUTO_APPROVE || "").toLowerCase();

  if (flag === "false" || flag === "0") {
    return false;
  }

  if (flag === "true" || flag === "1") {
    return true;
  }

  return process.env.NODE_ENV !== "test";
}

async function buildSimulatedPixQrCode(pixCopyPaste, gatewayPaymentId) {
  try {
    const dataUrl = await QRCode.toDataURL(pixCopyPaste, {
      margin: 1,
      width: 320,
      errorCorrectionLevel: "M",
    });

    return dataUrl.replace(/^data:image\/png;base64,/, "");
  } catch (error) {
    console.warn("[simulatedGateway] falha ao gerar QR Code Pix:", error.message);

    return `SIMULATED_PIX_QR:${gatewayPaymentId}`;
  }
}


/**
 * ============================================================
 * STORE EM MEMÓRIA DO GATEWAY SIMULADO
 * ============================================================
 *
 * O gateway simulado não possui servidor externo real.
 *
 * Por isso, os pagamentos criados ficam guardados em memória
 * enquanto o backend Node estiver rodando.
 *
 * IMPORTANTE:
 *
 * Ao reiniciar o backend, este Map é zerado.
 */
const store = new Map();


/**
 * Adiciona minutos a uma data.
 */
function addMinutes(date, minutes) {
  return new Date(
    date.getTime() +
      minutes * 60 * 1000
  );
}


/**
 * Token mágico para testar cartão recusado.
 */
const SIMULATED_DECLINED_CARD_TOKEN =
  "sim_card_declined";


/**
 * ============================================================
 * CRIA PAGAMENTO
 * ============================================================
 */
async function createPayment({
  paymentId,
  invoiceId,
  paymentMethod,
  amount,
  externalReference,
  idempotencyKey,
  cardToken,
  cardInstallments,
}) {

  /**
   * Somente esses métodos são aceitos.
   */
  if (
    ![
      "pix",
      "boleto",
      "credit_card",
    ].includes(paymentMethod)
  ) {
    throw new Error(
      `O gateway simulado não suporta o método de pagamento "${paymentMethod}".`
    );
  }


  /**
   * ==========================================================
   * IDEMPOTÊNCIA
   * ==========================================================
   *
   * Se a mesma tentativa já foi criada com essa chave,
   * devolvemos exatamente o mesmo pagamento.
   */
  const existing =
    store.get(idempotencyKey);


  if (existing) {
    return {
      ...existing,
    };
  }


  let result;


  /**
   * ==========================================================
   * PIX
   * ==========================================================
   */
  if (paymentMethod === "pix") {

    const gatewayPaymentId =
      `sim_pix_${crypto.randomUUID()}`;


    const expiresAt =
      addMinutes(
        new Date(),
        30
      );


    const pixCopyPaste = [
      "000201",
      "COURSEHUB",
      gatewayPaymentId,
      externalReference,
      Number(amount).toFixed(2),
    ].join("|");

    result = {
      gatewayPaymentId,

      status:
        "pending",

      gatewayStatus:
        "pending",

      gatewayStatusDetail:
        "pending_waiting_transfer",

      pixCopyPaste,

      pixQrCode: await buildSimulatedPixQrCode(pixCopyPaste, gatewayPaymentId),

      pixExpiresAt:
        formatDateTimeForMySQL(
          expiresAt
        ),

      paidAt:
        null,
    };

  }


  /**
   * ==========================================================
   * BOLETO
   * ==========================================================
   */
  else if (
    paymentMethod === "boleto"
  ) {

    const gatewayPaymentId =
      `sim_boleto_${crypto.randomUUID()}`;


    const dueDate =
      addMinutes(
        new Date(),
        3 * 24 * 60
      );


    result = {
      gatewayPaymentId,

      status:
        "pending",

      gatewayStatus:
        "pending",

      gatewayStatusDetail:
        "pending_waiting_payment",

      boletoBarcode: [
        "23790",
        "COURSEHUB",
        gatewayPaymentId,
        Number(amount).toFixed(2),
      ].join("."),

      boletoUrl:
        `SIMULATED_BOLETO_URL:${gatewayPaymentId}`,

      boletoDueDate:
        formatDateTimeForMySQL(
          dueDate
        ),

      paidAt:
        null,
    };

  }


  /**
   * ==========================================================
   * CARTÃO
   * ==========================================================
   *
   * Cartão simulado aprova imediatamente.
   *
   * Exceto quando usamos:
   *
   * sim_card_declined
   *
   * como cardToken.
   */
  else {

    const gatewayPaymentId =
      `sim_card_${crypto.randomUUID()}`;


    const declined =
      cardToken ===
      SIMULATED_DECLINED_CARD_TOKEN;


    result = {
      gatewayPaymentId,

      status:
        declined
          ? "rejected"
          : "approved",

      gatewayStatus:
        declined
          ? "rejected"
          : "approved",

      gatewayStatusDetail:
        declined
          ? "cc_rejected_other_reason"
          : "accredited",

      failureCode:
        declined
          ? "cc_rejected_other_reason"
          : null,

      cardBrand:
        "visa",

      cardLastFour:
        "1234",

      cardInstallments:
        cardInstallments
          ? Number(
              cardInstallments
            )
          : 1,

      paidAt:
        declined
          ? null
          : formatDateTimeForMySQL(
              new Date()
            ),
    };
  }


  /**
   * ==========================================================
   * SALVA NO STORE
   * ==========================================================
   *
   * Guardamos por:
   *
   * 1. idempotencyKey
   * 2. gatewayPaymentId
   */
  store.set(
    idempotencyKey,
    result
  );


  store.set(
    result.gatewayPaymentId,
    result
  );


  /**
   * ==========================================================
   * AUTO-APROVAÇÃO DE PIX / BOLETO
   * ==========================================================
   *
   * SOMENTE desenvolvimento.
   *
   * O objetivo é permitir testar:
   *
   * checkout
   * ↓
   * payment pending
   * ↓
   * pagamento aprovado
   * ↓
   * polling
   * ↓
   * processGatewayPaymentUpdate
   * ↓
   * invoice paid
   * ↓
   * contrato
   * ↓
   * matrícula
   * ↓
   * notificações
   *
   * sem precisar pagar dinheiro real.
   */
  if (
    shouldAutoApproveSimulatedPayment() &&
    ["pix", "boleto"].includes(paymentMethod)
  ) {

    /**
     * Tempo padrão:
     *
     * 5000 ms = 5 segundos
     */
    const delayMs =
      Number(
        process.env
          .SIMULATED_PAYMENT_AUTO_APPROVE_MS
      ) || 5000;


    const gatewayPaymentId =
      result.gatewayPaymentId;


    console.log(
      "\n=============================================="
    );

    console.log(
      "[simulatedGateway] PAGAMENTO SIMULADO CRIADO"
    );

    console.log({
      paymentId,
      invoiceId,
      paymentMethod,
      gatewayPaymentId,
      status:
        result.status,
      autoApproveInMs:
        delayMs,
    });

    console.log(
      "==============================================\n"
    );


    /**
     * Depois de alguns segundos,
     * altera o pagamento remoto simulado
     * para approved.
     */
    const timer =
      setTimeout(
        () => {

          try {

            simulateApproval(
              gatewayPaymentId
            );


            console.log(
              "\n=============================================="
            );

            console.log(
              "[simulatedGateway] PAGAMENTO AUTO-APROVADO"
            );

            console.log({
              gatewayPaymentId,
              status:
                "approved",
            });

            console.log(
              "==============================================\n"
            );

          } catch (error) {

            console.error(
              "[simulatedGateway] erro na auto-aprovação:",
              error.message
            );
          }

        },
        delayMs
      );


    /**
     * Não deixa o timer sozinho
     * impedir o Node de encerrar.
     */
    if (
      typeof timer.unref ===
        "function"
    ) {
      timer.unref();
    }
  }


  /**
   * Retorna uma cópia.
   */
  return {
    ...result,
  };
}


/**
 * ============================================================
 * BUSCA PAGAMENTO
 * ============================================================
 *
 * Essa função representa a consulta autoritativa
 * ao provider.
 */
async function getPayment(
  gatewayPaymentId
) {

  const stored =
    store.get(
      gatewayPaymentId
    );


  if (!stored) {

    const error =
      new Error(
        `Pagamento simulado "${gatewayPaymentId}" não encontrado.`
      );


    error.code =
      "GATEWAY_PAYMENT_NOT_FOUND";


    throw error;
  }


  return {
    ...stored,
  };
}


/**
 * ============================================================
 * REEMBOLSO
 * ============================================================
 */
async function refundPayment({
  gatewayPaymentId,
}) {

  const stored =
    store.get(
      gatewayPaymentId
    );


  if (!stored) {
    return {
      status:
        "failed",

      failureReason:
        "payment_not_found",
    };
  }


  if (
    stored.status !==
    "approved"
  ) {
    return {
      status:
        "failed",

      failureReason:
        "payment_not_approved",
    };
  }


  /**
   * Também atualizamos o estado
   * dentro do gateway simulado.
   */
  stored.status =
    "refunded";

  stored.gatewayStatus =
    "refunded";

  stored.gatewayStatusDetail =
    "refunded";


  return {
    status:
      "refunded",

    gatewayRefundId:
      `sim_refund_${crypto.randomUUID()}`,
  };
}


/**
 * ============================================================
 * WEBHOOK
 * ============================================================
 *
 * Não existe webhook HTTP real no gateway simulado.
 */
function verifyWebhook() {}


/**
 * O simulado não recebe webhook remoto.
 */
function parseWebhook() {
  throw new Error(
    "O gateway simulado não recebe webhooks reais; utilize o fluxo de desenvolvimento para simular uma aprovação."
  );
}


/**
 * ============================================================
 * APROVAÇÃO SIMULADA
 * ============================================================
 *
 * Altera o estado do pagamento no provider simulado.
 *
 * Depois disso:
 *
 * getPayment()
 *
 * começa a devolver approved.
 *
 * IMPORTANTE:
 *
 * Esta função NÃO altera diretamente:
 *
 * payments
 * invoices
 * financial_contracts
 * enrollments
 *
 * Isso continua sendo responsabilidade do
 * paymentProcessingService.
 */
function simulateApproval(
  gatewayPaymentId
) {

  const stored =
    store.get(
      gatewayPaymentId
    );


  if (!stored) {

    const error =
      new Error(
        `Pagamento simulado "${gatewayPaymentId}" não encontrado.`
      );


    error.code =
      "GATEWAY_PAYMENT_NOT_FOUND";


    throw error;
  }


  /**
   * Idempotência.
   *
   * Se já está aprovado,
   * simplesmente devolvemos.
   */
  if (
    stored.status ===
    "approved"
  ) {
    return {
      ...stored,
    };
  }


  stored.status =
    "approved";


  stored.gatewayStatus =
    "approved";


  stored.gatewayStatusDetail =
    "accredited";


  stored.paidAt =
    formatDateTimeForMySQL(
      new Date()
    );


  return {
    ...stored,
  };
}


/**
 * ============================================================
 * EXPORTS
 * ============================================================
 */
function resetStore() {
  store.clear();
}

module.exports = {
  createPayment,
  getPayment,
  refundPayment,
  verifyWebhook,
  parseWebhook,
  simulateApproval,
  resetStore,
  SIMULATED_DECLINED_CARD_TOKEN,
};