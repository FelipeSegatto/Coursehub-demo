/**
 * Wrapper do aluno autenticado sobre o motor central
 * de pagamentos.
 *
 * Este service:
 *
 * - resolve users.id -> students.id;
 * - garante ownership pelo aluno autenticado;
 * - delega a criação do pagamento para invoicePaymentService;
 * - durante development, sincroniza o gateway simulated
 *   durante o polling.
 */

const {
  getStudentIdByUserId,
  createServiceError,
} = require("../classes/classAccessService");

const { allowsSimulatedPayments } = require("../paymentGateway/demoGatewayPolicy");

const {
  startInvoicePayment,
  getInvoicePaymentByAccessContext,
} = require("./invoicePaymentService");

const {
  processGatewayPaymentUpdate,
} = require("./paymentProcessingService");

const simulatedGateway = require("../paymentGateway/simulatedGateway");

/**
 * ============================================================
 * CRIAR PAGAMENTO DE UMA INVOICE
 * ============================================================
 */
async function createInvoicePayment(
  db,
  {
    userId,
    invoiceId,
    paymentMethod,
  }
) {
  const studentId =
    await getStudentIdByUserId(
      db.promise(),
      userId
    );

  if (!studentId) {
    throw createServiceError(
      "Aluno não encontrado.",
      404
    );
  }

  return startInvoicePayment(
    db,
    {
      invoiceId,
      paymentMethod,

      accessContext: {
        scope: "student",

        studentId,

        /**
         * invoicePaymentService precisa do userId
         * para montar dados do pagador.
         */
        userId,
      },
    }
  );
}

/**
 * ============================================================
 * CONSULTAR PAGAMENTO DO ALUNO
 * ============================================================
 *
 * Essa função também é usada pelo polling do checkout.
 *
 * Em produção:
 *
 * Mercado Pago
 *   ↓
 * webhook
 *   ↓
 * processGatewayPaymentUpdate()
 *
 * Em development:
 *
 * simulatedGateway
 *   ↓
 * auto-approve em memória
 *   ↓
 * polling chega aqui
 *   ↓
 * processGatewayPaymentUpdate()
 */
async function getInvoicePaymentByUser(
  db,
  {
    userId,
    paymentId,
  }
) {
  const studentId =
    await getStudentIdByUserId(
      db.promise(),
      userId
    );

  if (!studentId) {
    throw createServiceError(
      "Aluno não encontrado.",
      404
    );
  }

  const accessContext = {
    scope: "student",
    studentId,
  };

  /**
   * ==========================================================
   * 1. LÊ O ESTADO LOCAL
   * ==========================================================
   */
  let payment =
    await getInvoicePaymentByAccessContext(
      db,
      {
        paymentId,
        accessContext,
      }
    );

  /**
   * Se já chegou em estado terminal, não existe
   * nada para sincronizar.
   */
  if (!allowsSimulatedPayments() || payment.status !== "pending") {
    return payment;
  }

  /**
   * ==========================================================
   * 2. LOCALIZA O IDENTIFICADOR DO PROVIDER
   * ==========================================================
   */
  const [rows] =
    await db.promise().query(
      `
        SELECT
          id,
          gateway,
          gateway_payment_id,
          status
        FROM payments
        WHERE id = ?
        LIMIT 1
      `,
      [paymentId]
    );

  const storedPayment =
    rows[0];

  if (!storedPayment) {
    throw createServiceError(
      "Pagamento não encontrado.",
      404
    );
  }

  /**
   * Só sincronizamos pagamentos realmente pertencentes
   * ao simulated gateway.
   */
  if (
    storedPayment.gateway !==
      "simulated" ||
    !storedPayment.gateway_payment_id
  ) {
    return payment;
  }

  /**
   * ==========================================================
   * 3. SINCRONIZA O ESTADO DO GATEWAY SIMULADO
   * ==========================================================
   */
  try {
    const syncResult =
      await processGatewayPaymentUpdate(
        db,
        {
          gateway:
            "simulated",

          gatewayPaymentId:
            storedPayment.gateway_payment_id,

          gatewayEventId:
            null,

          source:
            "simulated_gateway",
        }
      );

    console.log(
      "[studentPaymentService] simulated payment sync:",
      {
        paymentId:
          Number(paymentId),

        gatewayPaymentId:
          storedPayment.gateway_payment_id,

        result:
          syncResult,
      }
    );
  } catch (error) {
    /**
     * O simulatedGateway mantém seus pagamentos em um Map.
     *
     * Portanto, se o backend for reiniciado:
     *
     * MySQL:
     * payment continua pending
     *
     * simulatedGateway:
     * payment desaparece
     *
     * Nesse caso deixamos um log explícito.
     *
     * Não tratamos isso como aprovação, porque inventar
     * uma aprovação local seria diferente do comportamento
     * de um gateway real.
     */
    if (
      error.code ===
      "GATEWAY_PAYMENT_NOT_FOUND"
    ) {
      console.warn(
        "[studentPaymentService] pagamento simulated não existe mais em memória.",
        {
          paymentId:
            Number(paymentId),

          gatewayPaymentId:
            storedPayment.gateway_payment_id,

          message:
            "Provavelmente o backend foi reiniciado após a criação desse pagamento.",
        }
      );

      return payment;
    }

    throw error;
  }

  /**
   * ==========================================================
   * 4. RELÊ O BANCO
   * ==========================================================
   *
   * processGatewayPaymentUpdate() pode ter feito:
   *
   * payments
   * pending -> approved
   *
   * invoices
   * pending -> paid
   *
   * financial_contracts
   * pending_payment -> active
   *
   * enrollments
   * criada/ativada
   */
  payment =
    await getInvoicePaymentByAccessContext(
      db,
      {
        paymentId,
        accessContext,
      }
    );

  return payment;
}


/**
 * Confirma explicitamente um pagamento no gateway simulado.
 * Disponível somente fora de produção com PAYMENT_GATEWAY=simulated.
 */
async function simulateInvoicePaymentApproval(db, { userId, paymentId }) {
  if (!allowsSimulatedPayments()) {
    throw createServiceError("A simulação de pagamento não está disponível neste ambiente.", 404);
  }

  const studentId = await getStudentIdByUserId(db.promise(), userId);

  if (!studentId) {
    throw createServiceError("Aluno não encontrado.", 404);
  }

  const accessContext = { scope: "student", studentId };
  const payment = await getInvoicePaymentByAccessContext(db, { paymentId, accessContext });

  if (payment.status === "approved") {
    return payment;
  }

  if (payment.status !== "pending") {
    throw createServiceError("Este pagamento não está aguardando confirmação.", 409);
  }

  const [rows] = await db.promise().query(
    `SELECT gateway, gateway_payment_id FROM payments WHERE id = ? LIMIT 1`,
    [paymentId]
  );
  const storedPayment = rows[0];

  if (!storedPayment || storedPayment.gateway !== "simulated" || !storedPayment.gateway_payment_id) {
    throw createServiceError("Pagamento simulado não encontrado.", 404);
  }

  try {
    simulatedGateway.simulateApproval(storedPayment.gateway_payment_id);
  } catch (error) {
    if (error.code === "GATEWAY_PAYMENT_NOT_FOUND") {
      throw createServiceError(
        "Esta tentativa Pix foi perdida após um reinício do backend. Feche o modal e gere um novo Pix.",
        409
      );
    }
    throw error;
  }

  await processGatewayPaymentUpdate(db, {
    gateway: "simulated",
    gatewayPaymentId: storedPayment.gateway_payment_id,
    gatewayEventId: null,
    source: "simulated_gateway_manual_confirmation",
  });

  return getInvoicePaymentByAccessContext(db, { paymentId, accessContext });
}

module.exports = {
  createInvoicePayment,
  getInvoicePaymentByUser,
  simulateInvoicePaymentApproval,
};