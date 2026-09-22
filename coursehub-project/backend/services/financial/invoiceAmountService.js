const {
  recalculateFinancialContractStatus,
} = require("./contractFinancialService");

const {
  createFinancialEvent,
} = require("./financialEventService");

const { withTransaction } = require("../../utils/dbTransaction");
const { notifyInvoiceChanged } = require("./financialNotificationService");

/**
 * Cria um erro de negócio com status HTTP.
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
 */
function convertToCents(value) {
  return Math.round(Number(value) * 100);
}

/**
 * Altera o valor de uma fatura aberta e registra
 * a alteração no histórico financeiro.
 */
async function changeInvoiceAmount(
  db,
  {
    invoiceId,
    newAmount,
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
  const normalizedNewAmount = Number(newAmount);

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
    !Number.isFinite(normalizedNewAmount) ||
    normalizedNewAmount <= 0
  ) {
    throw createServiceError(
      "O novo valor da fatura deve ser maior que zero.",
      400
    );
  }

  if (
    typeof reason !== "string" ||
    !reason.trim()
  ) {
    throw createServiceError(
      "O motivo da alteração do valor é obrigatório.",
      400
    );
  }

  if (!actorUserId) {
    throw createServiceError(
      "Não foi possível identificar o administrador autenticado.",
      401
    );
  }

  return withTransaction(db, async (connection) => {
    const [invoices] = await connection.execute(
      `
        SELECT
          i.id,
          i.financial_contract_id,
          i.amount,
          i.status,
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
        "Não é possível alterar o valor de uma fatura já paga.",
        409
      );
    }

    if (invoice.status === "cancelled") {
      throw createServiceError(
        "Não é possível alterar o valor de uma fatura cancelada.",
        409
      );
    }

    if (invoice.status === "refunded") {
      throw createServiceError(
        "Não é possível alterar o valor de uma fatura reembolsada.",
        409
      );
    }

    const previousAmount = Number(invoice.amount);

    if (
      convertToCents(previousAmount) ===
      convertToCents(normalizedNewAmount)
    ) {
      throw createServiceError(
        `O novo valor deve ser diferente do valor atual da fatura, que é ${formatCurrency(
          previousAmount
        )}.`,
        400
      );
    }

    await connection.execute(
      `
        UPDATE invoices
        SET amount = ?
        WHERE id = ?
      `,
      [
        normalizedNewAmount,
        normalizedInvoiceId,
      ]
    );

    await createFinancialEvent(connection, {
      financialContractId:
        invoice.financial_contract_id,
      invoiceId: normalizedInvoiceId,
      paymentId: null,
      enrollmentId: invoice.enrollment_id,
      eventType: "invoice_amount_changed",
      source: "admin",
      actorUserId,
      previousValue: {
        amount: previousAmount,
      },
      newValue: {
        amount: normalizedNewAmount,
      },
      reason: reason.trim(),
    });

    await recalculateFinancialContractStatus(
      connection,
      invoice.financial_contract_id
    );

    await notifyInvoiceChanged(db, connection, {
      invoiceId: normalizedInvoiceId,
      invoiceDescription: invoice.description,
      changeType: "amount",
      previousValue: previousAmount.toFixed(2),
      newValue: normalizedNewAmount.toFixed(2),
      studentId: invoice.student_id,
      courseId: invoice.course_id,
      courseName: invoice.course_name,
    });

    return {
      invoiceId: normalizedInvoiceId,
      financialContractId:
        invoice.financial_contract_id,
      previousAmount,
      newAmount: normalizedNewAmount,
      invoiceStatus: invoice.status,
    };
  });
}

module.exports = {
  changeInvoiceAmount,
};