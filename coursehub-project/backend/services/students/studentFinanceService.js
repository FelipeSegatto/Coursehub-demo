const {
  getStudentIdByUserId,
  createServiceError,
} = require("../classes/classAccessService");
const { withTransaction } = require("../../utils/dbTransaction");
const { expireDuePaymentAttempts } = require("../financial/invoicePaymentService");

/**
 * Consolida contratos, faturas e pagamentos do aluno autenticado
 * em uma única resposta, com um resumo de totais e os destaques
 * (próxima fatura, fatura em atraso).
 */
async function getStudentFinance(db, userId) {
  const studentId = await getStudentIdByUserId(db.promise(), userId);

  if (!studentId) {
    throw createServiceError("Aluno não encontrado.", 404);
  }

  await withTransaction(db, async (connection) => {
    const [invoiceRows] = await connection.query(
      `
        SELECT i.id
        FROM invoices i
        INNER JOIN financial_contracts fc ON fc.id = i.financial_contract_id
        INNER JOIN enrollments e ON e.id = fc.enrollment_id
        WHERE e.student_id = ?
      `,
      [studentId]
    );

    for (const invoice of invoiceRows) {
      await expireDuePaymentAttempts(connection, invoice.id);
    }
  });

  const [contracts] = await db.promise().query(
    `
      SELECT
        fc.id,
        fc.enrollment_id AS enrollmentId,
        fc.pricing_plan_id AS pricingPlanId,
        e.student_id AS studentId,
        e.course_id AS courseId,
        c.name AS courseName,
        fc.billing_type AS billingType,
        fc.plan_name AS planName,
        fc.total_amount AS totalAmount,
        fc.monthly_payment_count AS monthlyPaymentCount,
        fc.monthly_payment_amount AS monthlyPaymentAmount,
        fc.max_card_installments AS maxCardInstallments,
        fc.accepts_pix AS acceptsPix,
        fc.accepts_boleto AS acceptsBoleto,
        fc.accepts_credit_card AS acceptsCreditCard,
        fc.status,
        fc.start_date AS startDate,
        fc.completed_at AS completedAt,
        fc.cancelled_at AS cancelledAt,
        fc.created_at AS createdAt,
        fc.updated_at AS updatedAt
      FROM financial_contracts fc
      INNER JOIN enrollments e ON e.id = fc.enrollment_id
      INNER JOIN courses c ON c.id = e.course_id
      WHERE e.student_id = ?
      ORDER BY fc.created_at DESC, fc.id DESC
    `,
    [studentId]
  );

  const [invoices] = await db.promise().query(
    `
      SELECT
        i.id,
        i.financial_contract_id AS contractId,
        e.student_id AS studentId,
        e.course_id AS courseId,
        c.name AS courseName,
        i.invoice_type AS invoiceType,
        i.installment_number AS installmentNumber,
        i.installment_count AS totalInstallments,
        i.description,
        i.amount,
        i.due_date AS dueDate,
        i.status,
        i.paid_at AS paidAt,
        i.cancelled_at AS cancelledAt,
        i.created_at AS createdAt,
        i.updated_at AS updatedAt
      FROM invoices i
      INNER JOIN financial_contracts fc ON fc.id = i.financial_contract_id
      INNER JOIN enrollments e ON e.id = fc.enrollment_id
      INNER JOIN courses c ON c.id = e.course_id
      WHERE e.student_id = ?
      ORDER BY i.due_date ASC, i.id ASC
    `,
    [studentId]
  );

  const [payments] = await db.promise().query(
    `
      SELECT
        p.id,
        p.invoice_id AS invoiceId,
        i.financial_contract_id AS contractId,
        e.student_id AS studentId,
        e.course_id AS courseId,
        c.name AS courseName,
        p.gateway,
        p.gateway_payment_id AS gatewayPaymentId,
        p.payment_method AS paymentMethod,
        p.amount,
        p.status,
        p.card_installments AS cardInstallments,
        p.card_brand AS cardBrand,
        p.card_last_four AS cardLastFour,
        p.pix_expires_at AS pixExpiresAt,
        p.boleto_due_date AS boletoDueDate,
        p.paid_at AS paidAt,
        p.rejected_at AS rejectedAt,
        p.cancelled_at AS cancelledAt,
        p.refunded_at AS refundedAt,
        p.created_at AS createdAt,
        p.updated_at AS updatedAt
      FROM payments p
      INNER JOIN invoices i ON i.id = p.invoice_id
      INNER JOIN financial_contracts fc ON fc.id = i.financial_contract_id
      INNER JOIN enrollments e ON e.id = fc.enrollment_id
      INNER JOIN courses c ON c.id = e.course_id
      WHERE e.student_id = ?
      ORDER BY
        COALESCE(p.paid_at, p.rejected_at, p.cancelled_at, p.refunded_at, p.created_at) DESC,
        p.id DESC
    `,
    [studentId]
  );

  const summary = {
    totalContracted: contracts.reduce(
      (total, contract) => total + Number(contract.totalAmount || 0),
      0
    ),
    totalPaid: invoices.reduce((total, invoice) => {
      if (invoice.status !== "paid") {
        return total;
      }

      return total + Number(invoice.amount || 0);
    }, 0),
    totalPending: invoices.reduce((total, invoice) => {
      if (!["pending", "processing"].includes(invoice.status)) {
        return total;
      }

      return total + Number(invoice.amount || 0);
    }, 0),
    totalOverdue: invoices.reduce((total, invoice) => {
      if (invoice.status !== "overdue") {
        return total;
      }

      return total + Number(invoice.amount || 0);
    }, 0),
  };

  // As faturas já vêm ordenadas por vencimento crescente.
  const overdueInvoice =
    invoices.find((invoice) => invoice.status === "overdue") || null;

  const nextInvoice =
    invoices.find((invoice) =>
      ["pending", "processing"].includes(invoice.status)
    ) || null;

  return { summary, overdueInvoice, nextInvoice, contracts, invoices, payments };
}

module.exports = {
  createServiceError,
  getStudentFinance,
};
