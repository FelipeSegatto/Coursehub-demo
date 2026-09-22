const {
  recalculateFinancialContractStatus,
} = require("./contractFinancialService");

const {
  createFinancialEvent,
} = require("./financialEventService");

const { withTransaction } = require("../../utils/dbTransaction");
const { notifyInvoiceChanged } = require("./financialNotificationService");
const { formatDateOnly } = require("../../utils/appConfig");

async function changeInvoiceDueDate(
  db,
  {
    invoiceId,
    dueDate,
    reason,
    actorUserId,
  }
) {
  if (!db) {
    throw new Error("Database instance is required.");
  }

  if (!Number.isInteger(Number(invoiceId)) || Number(invoiceId) <= 0) {
    throw new Error("Invoice ID is required.");
  }

  if (!dueDate) {
    throw new Error("New due date is required.");
  }

  if (!reason || !reason.trim()) {
    throw new Error("A reason is required.");
  }

  if (!actorUserId) {
    throw new Error("Authenticated admin user is required.");
  }

  const normalizedInvoiceId = Number(invoiceId);

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (!datePattern.test(dueDate)) {
    throw new Error("Invalid due date format. Use YYYY-MM-DD.");
  }

  return withTransaction(db, async (connection) => {
    const [invoices] = await connection.execute(
      `
        SELECT
          i.id,
          i.financial_contract_id,
          i.due_date,
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
      throw new Error("Invoice not found.");
    }

    const invoice = invoices[0];

    const closedStatuses = [
      "paid",
      "cancelled",
      "refunded",
    ];

    if (closedStatuses.includes(invoice.status)) {
      throw new Error(
        "The due date of a closed invoice cannot be changed."
      );
    }

    const nextDueDate = new Date(`${dueDate}T00:00:00`);

    if (Number.isNaN(nextDueDate.getTime())) {
      throw new Error("Invalid due date.");
    }

    const normalizedDateParts = dueDate
      .split("-")
      .map(Number);

    const [year, month, day] = normalizedDateParts;

    if (
      nextDueDate.getFullYear() !== year ||
      nextDueDate.getMonth() + 1 !== month ||
      nextDueDate.getDate() !== day
    ) {
      throw new Error("Invalid due date.");
    }

    const today = new Date();

    const currentDate = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );

    const nextStatus =
      nextDueDate < currentDate
        ? "overdue"
        : "pending";

    const previousDueDate = invoice.due_date;

    await connection.execute(
      `
        UPDATE invoices
        SET
          due_date = ?,
          status = ?
        WHERE id = ?
      `,
      [
        dueDate,
        nextStatus,
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
      enrollmentId: invoice.enrollment_id,
      eventType: "invoice_due_date_changed",
      source: "admin",
      actorUserId,
      previousValue: {
        dueDate: previousDueDate,
        status: invoice.status,
      },
      newValue: {
        dueDate,
        status: nextStatus,
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
      changeType: "due_date",
      previousValue: formatDateOnly(previousDueDate),
      newValue: dueDate,
      studentId: invoice.student_id,
      courseId: invoice.course_id,
      courseName: invoice.course_name,
    });

    return {
      invoiceId: normalizedInvoiceId,
      previousDueDate,
      dueDate,
      status: nextStatus,
    };
  });
}

module.exports = {
  changeInvoiceDueDate,
};