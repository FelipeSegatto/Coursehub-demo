/**
 * Consultas financeiras de leitura.
 */
const { withTransaction } = require("../../utils/dbTransaction");
const { expireDuePaymentAttempts } = require("./invoicePaymentService");

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

/**
 * Converte valores JSON retornados pelo banco quando necessário.
 */
function parseJsonValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Retorna os detalhes completos de uma fatura,
 * incluindo pagamentos, ações de cobrança e eventos.
 */
async function getInvoiceDetails(db, invoiceId) {
  if (!db) {
    throw createServiceError(
      "A conexão com o banco de dados não foi fornecida.",
      500
    );
  }

  const normalizedInvoiceId = Number(invoiceId);

  if (
    !Number.isInteger(normalizedInvoiceId) ||
    normalizedInvoiceId <= 0
  ) {
    throw createServiceError(
      "O identificador da fatura é obrigatório e deve ser válido.",
      400
    );
  }

  await withTransaction(db, (connection) =>
    expireDuePaymentAttempts(connection, normalizedInvoiceId)
  );

  const connection = await db.promise().getConnection();

  try {
    const [invoices] = await connection.execute(
      `
        SELECT
          i.id,
          i.financial_contract_id,
          i.invoice_type,
          i.installment_number,
          i.installment_count,
          i.description,
          i.original_amount,
          i.amount,
          i.discount_amount,
          i.discount_reason,
          i.discount_applied_at,
          i.discount_applied_by_user_id,
          i.due_date,
          i.status,
          i.paid_at,
          i.cancelled_at,
          i.created_at,
          i.updated_at,

          fc.enrollment_id,
          fc.pricing_plan_id,
          fc.billing_type,
          fc.plan_name,
          fc.total_amount AS contract_total_amount,
          fc.monthly_payment_count,
          fc.monthly_payment_amount,
          fc.status AS contract_status,
          fc.start_date AS contract_start_date
        FROM invoices i
        INNER JOIN financial_contracts fc
          ON fc.id = i.financial_contract_id
        WHERE i.id = ?
        LIMIT 1
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

    const [payments] = await connection.execute(
      `
        SELECT
          id,
          gateway,
          gateway_payment_id,
          source,
          recorded_by_user_id,
          admin_note,
          payment_method,
          amount,
          status,
          card_installments,
          card_brand,
          card_last_four,
          pix_expires_at,
          boleto_due_date,
          paid_at,
          rejected_at,
          cancelled_at,
          refunded_at,
          refund_reason,
          refunded_by_user_id,
          created_at,
          updated_at
        FROM payments
        WHERE invoice_id = ?
        ORDER BY created_at DESC, id DESC
      `,
      [normalizedInvoiceId]
    );

    const [collectionActions] =
      await connection.execute(
        `
          SELECT
            id,
            action_type,
            status,
            scheduled_for,
            processed_at,
            error_message,
            created_at
          FROM invoice_collection_actions
          WHERE invoice_id = ?
          ORDER BY scheduled_for ASC, id ASC
        `,
        [normalizedInvoiceId]
      );

    const [events] = await connection.execute(
      `
        SELECT
          id,
          financial_contract_id,
          invoice_id,
          payment_id,
          enrollment_id,
          event_type,
          source,
          actor_user_id,
          previous_value,
          new_value,
          reason,
          created_at
        FROM financial_events
        WHERE invoice_id = ?
        ORDER BY created_at DESC, id DESC
      `,
      [normalizedInvoiceId]
    );

    // Mesma fonte que a lista de pagamentos exibida abaixo -- soma
    // em JS a partir do array já buscado, nunca uma segunda consulta
    // que poderia divergir do que a tela realmente lista.
    const paidAmount = payments.reduce(
      (total, payment) =>
        payment.status === "approved"
          ? total + Number(payment.amount)
          : total,
      0
    );

    return {
      invoice: {
        id: invoice.id,
        financialContractId:
          invoice.financial_contract_id,
        invoiceType: invoice.invoice_type,
        installmentNumber:
          invoice.installment_number,
        installmentCount:
          invoice.installment_count,
        description: invoice.description,
        originalAmount:
          invoice.original_amount === null
            ? null
            : Number(invoice.original_amount),
        amount: Number(invoice.amount),
        paidAmount,
        discountAmount: Number(
          invoice.discount_amount
        ),
        discountReason:
          invoice.discount_reason,
        discountAppliedAt:
          invoice.discount_applied_at,
        discountAppliedByUserId:
          invoice.discount_applied_by_user_id,
        dueDate: invoice.due_date,
        status: invoice.status,
        paidAt: invoice.paid_at,
        cancelledAt: invoice.cancelled_at,
        createdAt: invoice.created_at,
        updatedAt: invoice.updated_at,
      },

      contract: {
        id: invoice.financial_contract_id,
        enrollmentId: invoice.enrollment_id,
        pricingPlanId: invoice.pricing_plan_id,
        billingType: invoice.billing_type,
        planName: invoice.plan_name,
        totalAmount: Number(
          invoice.contract_total_amount
        ),
        monthlyPaymentCount:
          invoice.monthly_payment_count,
        monthlyPaymentAmount:
          invoice.monthly_payment_amount === null
            ? null
            : Number(
                invoice.monthly_payment_amount
              ),
        status: invoice.contract_status,
        startDate: invoice.contract_start_date,
      },

      payments: payments.map((payment) => ({
        id: payment.id,
        gateway: payment.gateway,
        gatewayPaymentId:
          payment.gateway_payment_id,
        source: payment.source,
        recordedByUserId:
          payment.recorded_by_user_id,
        adminNote: payment.admin_note,
        paymentMethod:
          payment.payment_method,
        amount: Number(payment.amount),
        status: payment.status,
        cardInstallments:
          payment.card_installments,
        cardBrand: payment.card_brand,
        cardLastFour:
          payment.card_last_four,
        pixExpiresAt: payment.pix_expires_at,
        boletoDueDate:
          payment.boleto_due_date,
        paidAt: payment.paid_at,
        rejectedAt: payment.rejected_at,
        cancelledAt: payment.cancelled_at,
        refundedAt: payment.refunded_at,
        refundReason: payment.refund_reason,
        refundedByUserId:
          payment.refunded_by_user_id,
        createdAt: payment.created_at,
        updatedAt: payment.updated_at,
      })),

      collectionActions: collectionActions.map(
        (action) => ({
          id: action.id,
          actionType: action.action_type,
          status: action.status,
          scheduledFor: action.scheduled_for,
          processedAt: action.processed_at,
          errorMessage: action.error_message,
          createdAt: action.created_at,
        })
      ),

      events: events.map((event) => ({
        id: event.id,
        financialContractId:
          event.financial_contract_id,
        invoiceId: event.invoice_id,
        paymentId: event.payment_id,
        enrollmentId: event.enrollment_id,
        eventType: event.event_type,
        source: event.source,
        actorUserId: event.actor_user_id,
        previousValue: parseJsonValue(
          event.previous_value
        ),
        newValue: parseJsonValue(
          event.new_value
        ),
        reason: event.reason,
        createdAt: event.created_at,
      })),
    };
  } finally {
    connection.release();
  }
}

/**
 * Retorna os eventos financeiros de um contrato.
 */
async function getFinancialContractEvents(
  db,
  contractId
) {
  if (!db) {
    throw createServiceError(
      "A conexão com o banco de dados não foi fornecida.",
      500
    );
  }

  const normalizedContractId = Number(contractId);

  if (
    !Number.isInteger(normalizedContractId) ||
    normalizedContractId <= 0
  ) {
    throw createServiceError(
      "O identificador do contrato financeiro é obrigatório e deve ser válido.",
      400
    );
  }

  const connection = await db.promise().getConnection();

  try {
    const [contracts] = await connection.execute(
      `
        SELECT
          id,
          enrollment_id,
          pricing_plan_id,
          billing_type,
          plan_name,
          total_amount,
          monthly_payment_count,
          monthly_payment_amount,
          status,
          start_date,
          completed_at,
          cancelled_at,
          created_at,
          updated_at
        FROM financial_contracts
        WHERE id = ?
        LIMIT 1
      `,
      [normalizedContractId]
    );

    if (contracts.length === 0) {
      throw createServiceError(
        "Contrato financeiro não encontrado.",
        404
      );
    }

    const contract = contracts[0];

    const [events] = await connection.execute(
      `
        SELECT
          id,
          financial_contract_id,
          invoice_id,
          payment_id,
          enrollment_id,
          event_type,
          source,
          actor_user_id,
          previous_value,
          new_value,
          reason,
          created_at
        FROM financial_events
        WHERE financial_contract_id = ?
        ORDER BY created_at DESC, id DESC
      `,
      [normalizedContractId]
    );

    return {
      contract: {
        id: contract.id,
        enrollmentId: contract.enrollment_id,
        pricingPlanId: contract.pricing_plan_id,
        billingType: contract.billing_type,
        planName: contract.plan_name,
        totalAmount: Number(
          contract.total_amount
        ),
        monthlyPaymentCount:
          contract.monthly_payment_count,
        monthlyPaymentAmount:
          contract.monthly_payment_amount === null
            ? null
            : Number(
                contract.monthly_payment_amount
              ),
        status: contract.status,
        startDate: contract.start_date,
        completedAt: contract.completed_at,
        cancelledAt: contract.cancelled_at,
        createdAt: contract.created_at,
        updatedAt: contract.updated_at,
      },

      events: events.map((event) => ({
        id: event.id,
        financialContractId:
          event.financial_contract_id,
        invoiceId: event.invoice_id,
        paymentId: event.payment_id,
        enrollmentId: event.enrollment_id,
        eventType: event.event_type,
        source: event.source,
        actorUserId: event.actor_user_id,
        previousValue: parseJsonValue(
          event.previous_value
        ),
        newValue: parseJsonValue(
          event.new_value
        ),
        reason: event.reason,
        createdAt: event.created_at,
      })),
    };
  } finally {
    connection.release();
  }
}

module.exports = {
  getInvoiceDetails,
  getFinancialContractEvents,
};