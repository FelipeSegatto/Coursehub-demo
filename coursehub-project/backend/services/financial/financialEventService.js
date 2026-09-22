async function createFinancialEvent(
  connection,
  {
    financialContractId = null,
    invoiceId = null,
    paymentId = null,
    enrollmentId = null,
    eventType,
    source,
    actorUserId = null,
    previousValue = null,
    newValue = null,
    reason = null,
  }
) {
  if (!connection) {
    throw new Error("A database connection is required.");
  }

  // Most events anchor on a contract, but account-activation events
  // (invitation created/resent, manual link, account activated) are
  // about a user's access and may only have an enrollmentId to
  // anchor on (e.g. a scholarship enrollment with no
  // financial_contract at all) -- at least one anchor is required,
  // not specifically financialContractId.
  if (!financialContractId && !invoiceId && !paymentId && !enrollmentId) {
    throw new Error(
      "At least one of financialContractId, invoiceId, paymentId or enrollmentId is required."
    );
  }

  if (!eventType) {
    throw new Error("eventType is required.");
  }

  if (!source) {
    throw new Error("source is required.");
  }

  const serializedPreviousValue =
    previousValue !== null && previousValue !== undefined
      ? JSON.stringify(previousValue)
      : null;

  const serializedNewValue =
    newValue !== null && newValue !== undefined
      ? JSON.stringify(newValue)
      : null;

  const [result] = await connection.execute(
    `
      INSERT INTO financial_events (
        financial_contract_id,
        invoice_id,
        payment_id,
        enrollment_id,
        event_type,
        source,
        actor_user_id,
        previous_value,
        new_value,
        reason
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      financialContractId,
      invoiceId,
      paymentId,
      enrollmentId,
      eventType,
      source,
      actorUserId,
      serializedPreviousValue,
      serializedNewValue,
      reason,
    ]
  );

  return {
    id: result.insertId,
    financialContractId,
    invoiceId,
    paymentId,
    enrollmentId,
    eventType,
    source,
    actorUserId,
    previousValue,
    newValue,
    reason,
  };
}

module.exports = {
  createFinancialEvent,
};