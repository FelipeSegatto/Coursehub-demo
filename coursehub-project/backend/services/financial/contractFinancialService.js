async function recalculateFinancialContractStatus(
  connection,
  financialContractId
) {
  if (!connection) {
    throw new Error("A database connection is required.");
  }

  if (!financialContractId) {
    throw new Error("Financial contract ID is required.");
  }

  const [contracts] = await connection.execute(
    `
      SELECT id, status
      FROM financial_contracts
      WHERE id = ?
      FOR UPDATE
    `,
    [financialContractId]
  );

  if (contracts.length === 0) {
    throw new Error("Financial contract not found.");
  }

  const currentContract = contracts[0];

  // 'pending_payment' contracts are only ever moved to 'active' by
  // activateContractFromPaidInvoice (it also creates the enrollment
  // at the same time) -- recalculating from invoice states alone
  // here would wrongly mark a contract 'completed'/'active' from its
  // very first invoice being paid, before the enrollment exists.
  if (currentContract.status === "cancelled" || currentContract.status === "pending_payment") {
    return currentContract.status;
  }

  const [rows] = await connection.execute(
    `
      SELECT
        COUNT(*) AS total_invoices,

        SUM(
          CASE
            WHEN status = 'overdue' THEN 1
            ELSE 0
          END
        ) AS overdue_invoices,

        SUM(
          CASE
            WHEN status IN ('pending', 'processing') THEN 1
            ELSE 0
          END
        ) AS open_invoices,

        SUM(
          CASE
            WHEN status IN ('paid', 'refunded', 'cancelled') THEN 1
            ELSE 0
          END
        ) AS closed_invoices

      FROM invoices
      WHERE financial_contract_id = ?
    `,
    [financialContractId]
  );

  const summary = rows[0];

  const totalInvoices = Number(summary.total_invoices || 0);
  const overdueInvoices = Number(summary.overdue_invoices || 0);
  const openInvoices = Number(summary.open_invoices || 0);
  const closedInvoices = Number(summary.closed_invoices || 0);

  let nextStatus = "active";

  if (overdueInvoices > 0) {
    nextStatus = "overdue";
  } else if (
    totalInvoices > 0 &&
    closedInvoices === totalInvoices
  ) {
    nextStatus = "completed";
  } else if (openInvoices > 0) {
    nextStatus = "active";
  }

  if (nextStatus !== currentContract.status) {
    await connection.execute(
      `
        UPDATE financial_contracts
        SET status = ?
        WHERE id = ?
      `,
      [nextStatus, financialContractId]
    );
  }

  return nextStatus;
}

module.exports = {
  recalculateFinancialContractStatus,
};