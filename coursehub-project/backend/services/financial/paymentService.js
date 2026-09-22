const crypto = require("crypto");

const {
  recalculateFinancialContractStatus,
} = require("./contractFinancialService");

const {
  createFinancialEvent,
} = require("./financialEventService");

const { withTransaction } = require("../../utils/dbTransaction");
const { notifyPaymentApproved } = require("./financialNotificationService");
const {
  activateContractFromPaidInvoice,
  dispatchActivationNotifications,
  dispatchAdminEnrollmentNotification,
} = require("./activateContractService");

/**
 * Cria um erro com um código HTTP associado.
 */
function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

/**
 * Formata um valor monetário no padrão brasileiro.
 */
function formatCurrency(value) {
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Converte um valor monetário para centavos.
 * Isso evita comparações imprecisas com números decimais.
 */
function convertToCents(value) {
  return Math.round(Number(value) * 100);
}

/**
 * Converte uma data recebida pela API para o formato DATETIME do MySQL.
 */
function normalizePaymentDate(paymentDate) {
  if (!paymentDate) {
    return null;
  }

  const parsedDate = new Date(paymentDate);

  if (Number.isNaN(parsedDate.getTime())) {
    throw createServiceError(
      "A data do pagamento informada é inválida.",
      400
    );
  }

  const year = parsedDate.getFullYear();
  const month = String(
    parsedDate.getMonth() + 1
  ).padStart(2, "0");
  const day = String(parsedDate.getDate()).padStart(2, "0");
  const hours = String(parsedDate.getHours()).padStart(2, "0");
  const minutes = String(
    parsedDate.getMinutes()
  ).padStart(2, "0");
  const seconds = String(
    parsedDate.getSeconds()
  ).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Registra manualmente o pagamento integral de uma fatura,
 * atualiza seus status e mantém o histórico financeiro.
 */
async function registerManualPayment(
  db,
  {
    invoiceId,
    amount,
    paymentMethod,
    paymentDate,
    reason,
    actorUserId,
  }
) {
  if (!db) {
    throw createServiceError(
      "A conexão com o banco de dados não foi fornecida.",
      500
    );
  }

  const normalizedInvoiceId = Number(invoiceId);
  const normalizedAmount = Number(amount);

  if (
    !Number.isInteger(normalizedInvoiceId) ||
    normalizedInvoiceId <= 0
  ) {
    throw createServiceError(
      "O identificador da fatura é obrigatório e deve ser válido.",
      400
    );
  }

  if (
    !Number.isFinite(normalizedAmount) ||
    normalizedAmount <= 0
  ) {
    throw createServiceError(
      "O valor do pagamento é obrigatório e deve ser maior que zero.",
      400
    );
  }

  // Registro manual é um fluxo administrativo, não o checkout online
  // processado por gateway (invoicePaymentService.js) -- por isso
  // aceita um conjunto maior de métodos, incluindo os que nunca
  // passam por um gateway de pagamento automatizado.
  const allowedPaymentMethods = [
    "pix",
    "boleto",
    "credit_card",
    "debit_card",
    "bank_transfer",
    "cash",
    "other",
  ];

  if (!allowedPaymentMethods.includes(paymentMethod)) {
    throw createServiceError(
      `O método de pagamento informado é inválido. Utilize um dos seguintes: ${allowedPaymentMethods.join(", ")}.`,
      400
    );
  }

  if (
    typeof reason !== "string" ||
    !reason.trim()
  ) {
    throw createServiceError(
      "O motivo do registro manual é obrigatório.",
      400
    );
  }

  if (!actorUserId) {
    throw createServiceError(
      "Não foi possível identificar o administrador autenticado.",
      401
    );
  }

  const normalizedPaymentDate =
    normalizePaymentDate(paymentDate) ||
    normalizePaymentDate(new Date());

  const result = await withTransaction(db, async (connection) => {
    const [invoices] = await connection.execute(
      `
        SELECT
          i.id,
          i.financial_contract_id,
          i.amount,
          i.status,
          i.paid_at,
          i.description,
          fc.enrollment_id,
          fc.student_id,
          fc.course_id,
          c.name AS course_name
        FROM invoices i
        INNER JOIN financial_contracts fc
          ON fc.id = i.financial_contract_id
        INNER JOIN courses c
          ON c.id = fc.course_id
        WHERE i.id = ?
        FOR UPDATE
      `,
      [normalizedInvoiceId]
    );

    if (invoices.length === 0) {
      throw createServiceError(
        "Fatura não encontrada.",
        404
      );
    }

    const invoice = invoices[0];

    if (invoice.status === "paid") {
      throw createServiceError(
        "Não é possível registrar o pagamento porque esta fatura já está paga.",
        409
      );
    }

    if (invoice.status === "cancelled") {
      throw createServiceError(
        "Não é possível registrar o pagamento de uma fatura cancelada.",
        409
      );
    }

    if (invoice.status === "refunded") {
      throw createServiceError(
        "Não é possível registrar o pagamento de uma fatura reembolsada.",
        409
      );
    }

    const invoiceAmount = Number(invoice.amount);

    /*
     * O modelo atual não possui pagamento parcial.
     * Por isso, o pagamento precisa corresponder ao valor integral.
     */
    if (
      convertToCents(normalizedAmount) !==
      convertToCents(invoiceAmount)
    ) {
      throw createServiceError(
        `O valor do pagamento deve ser exatamente ${formatCurrency(
          invoiceAmount
        )}.`,
        400
      );
    }

    const [existingPayments] = await connection.execute(
      `
        SELECT id
        FROM payments
        WHERE invoice_id = ?
          AND status = 'approved'
        LIMIT 1
        FOR UPDATE
      `,
      [normalizedInvoiceId]
    );

    if (existingPayments.length > 0) {
      throw createServiceError(
        "Já existe um pagamento aprovado para esta fatura.",
        409
      );
    }

    const gatewayPaymentId =
      `manual_${crypto.randomUUID()}`;

    // gateway = "manual" é um sentinela que significa "nenhum
    // provedor de pagamento foi envolvido" -- distinto dos dois
    // nomes de provider reais ("simulated"/"mercado_pago") que um
    // pagamento processado por gateway carrega. source =
    // "admin_manual" é o campo que o restante do módulo financeiro
    // já lê para distinguir pagamentos manuais de pagamentos
    // processados por gateway (paymentRefundService pula a chamada
    // externa de reembolso para esse source, por exemplo); este
    // INSERT antes deixava no valor default ("gateway"), o que era
    // semanticamente errado para dinheiro que um admin registrou à
    // mão.
    const [paymentResult] = await connection.execute(
      `
        INSERT INTO payments (
          invoice_id,
          gateway,
          gateway_payment_id,
          source,
          recorded_by_user_id,
          admin_note,
          payment_method,
          amount,
          currency,
          status,
          paid_at
        )
        VALUES (?, ?, ?, 'admin_manual', ?, ?, ?, ?, 'BRL', ?, ?)
      `,
      [
        normalizedInvoiceId,
        "manual",
        gatewayPaymentId,
        actorUserId,
        reason.trim(),
        paymentMethod,
        normalizedAmount,
        "approved",
        normalizedPaymentDate,
      ]
    );

    const paymentId = paymentResult.insertId;

    await connection.execute(
      `
        INSERT INTO payment_events (payment_id, event_type, previous_status, new_status, source, payload)
        VALUES (?, 'payment_recorded_manually', 'created', 'approved', 'admin', ?)
      `,
      [paymentId, JSON.stringify({ paymentMethod, reason: reason.trim() })]
    );

    await connection.execute(
      `
        UPDATE invoices
        SET
          status = 'paid',
          paid_at = ?,
          cancelled_at = NULL
        WHERE id = ?
      `,
      [
        normalizedPaymentDate,
        normalizedInvoiceId,
      ]
    );

    await connection.execute(
      `
        DELETE FROM invoice_collection_actions
        WHERE invoice_id = ?
          AND status IN ('pending', 'skipped')
      `,
      [normalizedInvoiceId]
    );

    await createFinancialEvent(connection, {
      financialContractId:
        invoice.financial_contract_id,
      invoiceId: normalizedInvoiceId,
      paymentId,
      enrollmentId: invoice.enrollment_id,
      eventType: "invoice_paid_manually",
      source: "admin",
      actorUserId,
      previousValue: {
        invoiceStatus: invoice.status,
        paidAt: invoice.paid_at,
      },
      newValue: {
        invoiceStatus: "paid",
        paymentStatus: "approved",
        amount: normalizedAmount,
        paymentMethod,
        paidAt: normalizedPaymentDate,
      },
      reason: reason.trim(),
    });

    await recalculateFinancialContractStatus(
      connection,
      invoice.financial_contract_id
    );

    await notifyPaymentApproved(db, connection, {
      paymentId,
      invoiceId: normalizedInvoiceId,
      invoiceDescription: invoice.description,
      amount: normalizedAmount.toFixed(2),
      studentId: invoice.student_id,
      courseId: invoice.course_id,
      courseName: invoice.course_name,
      paymentMethod,
    });

    // Mesma regra central usada pela aprovação via gateway -- se esta
    // é a fatura de ativação do contrato, cria a matrícula e ativa o
    // contrato agora, dentro desta mesma transação.
    const activationResult = await activateContractFromPaidInvoice(
      db,
      normalizedInvoiceId,
      { connection, source: "admin" }
    );

    return {
      paymentId,
      invoiceId: normalizedInvoiceId,
      financialContractId:
        invoice.financial_contract_id,
      amount: normalizedAmount,
      paymentMethod,
      paymentDate: normalizedPaymentDate,
      invoiceStatus: "paid",
      paymentStatus: "approved",
      activationResult,
    };
  });

  if (result?.activationResult?.activated) {
    await dispatchActivationNotifications(db, result.activationResult);
    await dispatchAdminEnrollmentNotification(db, {
      enrollmentId: result.activationResult.enrollmentId,
      contractId: result.activationResult.contractId,
      invoiceId: result.activationResult.invoiceId,
      studentId: result.activationResult.studentId,
      courseId: result.activationResult.courseId,
      origin: result.activationResult.origin,
      paymentId: result.paymentId,
      amount: result.amount,
    });
  }

  return result;
}

module.exports = {
  registerManualPayment,
};