const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();

require("../../services/notifications/eventDefinitions"); // registra financial.payment.approved/refunded

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");

const { createInvoicePayment, getInvoicePaymentByUser } = require("../../services/financial/studentPaymentService");
const { startInvoicePayment, expireDuePaymentAttempts } = require("../../services/financial/invoicePaymentService");
const { registerManualPayment } = require("../../services/financial/paymentService");
const { refundPayment } = require("../../services/financial/paymentRefundService");
const { processGatewayPaymentUpdate } = require("../../services/financial/paymentProcessingService");
const { withTransaction } = require("../../utils/dbTransaction");
const simulatedGateway = require("../../services/paymentGateway/simulatedGateway");
const mercadoPagoGateway = require("../../services/paymentGateway/mercadoPagoGateway");
const { WebhookSignatureValidator } = require("mercadopago");
const {
  findOrCreateSelfContractingPartyForStudent,
} = require("../../services/financial/contractingPartyService");

// Disjunto dos fixtures financeiros já usados em outros arquivos
// desta suíte: financialAndCalendar.test.js usa aluno 61/curso 1,
// scheduledReminders.test.js usa aluno 59/curso 4. O aluno 60
// (usuário 82, Beatriz Tobita) não tem matrícula no curso 5 --
// escolhido especificamente para evitar colisão com nenhum dos dois
// quando o node:test roda todos os arquivos deste diretório
// concorrentemente.
const STUDENT_ID = 60;
const STUDENT_USER_ID = 82;
const FIN_COURSE_ID = 5;
const PRICING_PLAN_ID = 5;
const ADMIN_ACTOR_USER_ID = 42; // admin real (Felipe Segatto), já usado só para leitura em outros pontos desta suíte

// Identidade de "outro aluno" para o teste de IDOR -- uso somente de
// leitura (resolvendo o students.id a partir do users.id), então
// reaproveitar um fixture que outro arquivo também usa para escrita
// (scheduledReminders.test.js usa o aluno 59) não traz risco de
// colisão.
const OTHER_STUDENT_USER_ID = 81;

let financialContractId;
let invoiceCounter = 0;
const createdInvoiceIds = [];

async function cleanupStaleFixture() {
  const [staleInvoices] = await db.promise().query(
    `
      SELECT i.id
      FROM invoices i
      INNER JOIN financial_contracts fc ON fc.id = i.financial_contract_id
      INNER JOIN enrollments en ON en.id = fc.enrollment_id
      WHERE en.student_id = ? AND en.course_id = ?
    `,
    [STUDENT_ID, FIN_COURSE_ID]
  );

  if (staleInvoices.length > 0) {
    const staleIds = staleInvoices.map((row) => row.id);
    const placeholders = staleIds.map(() => "?").join(",");

    await db.promise().query(`UPDATE invoices SET status = 'cancelled' WHERE id IN (${placeholders})`, staleIds);
    await db.promise().query(`DELETE FROM invoice_collection_actions WHERE invoice_id IN (${placeholders})`, staleIds);
    await db.promise().query(
      `DELETE FROM payment_events WHERE payment_id IN (SELECT id FROM payments WHERE invoice_id IN (${placeholders}))`,
      staleIds
    );
    await db.promise().query(
      `DELETE FROM financial_events WHERE invoice_id IN (${placeholders}) OR payment_id IN (SELECT id FROM payments WHERE invoice_id IN (${placeholders}))`,
      [...staleIds, ...staleIds]
    );
    await db.promise().query(`DELETE FROM payments WHERE invoice_id IN (${placeholders})`, staleIds);
    await db.promise().query(`DELETE FROM invoices WHERE id IN (${placeholders})`, staleIds);
  }

  await db.promise().query(
    `DELETE FROM financial_contracts WHERE enrollment_id IN (SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?)`,
    [STUDENT_ID, FIN_COURSE_ID]
  );

  await db.promise().query("DELETE FROM enrollments WHERE student_id = ? AND course_id = ?", [STUDENT_ID, FIN_COURSE_ID]);
}

before(async () => {
  await cleanupStaleFixture();

  const [enrollmentResult] = await db.promise().query(
    `
      INSERT INTO enrollments (student_id, course_id, class_id, status, enrolled_at, created_at, updated_at)
      VALUES (?, ?, NULL, 'active', NOW(), NOW(), NOW())
    `,
    [STUDENT_ID, FIN_COURSE_ID]
  );

  const enrollmentId = enrollmentResult.insertId;

  const contractingPartyId = await findOrCreateSelfContractingPartyForStudent(db.promise(), {
    studentId: STUDENT_ID,
  });

  // status = 'active' (not 'pending_payment') on purpose: this suite
  // exercises ongoing payment/gateway plumbing against an already
  // established contract, not the initial contract-activation
  // lifecycle (that has its own dedicated suite, see
  // test/financial/contractingFlow.test.js). A 'pending_payment'
  // contract only leaves that status via activateContractFromPaidInvoice
  // matching its specific activation_invoice_id, which doesn't apply
  // to this fixture's many ad-hoc invoices/payments.
  const [contractResult] = await db.promise().query(
    `
      INSERT INTO financial_contracts
        (enrollment_id, student_id, course_id, contracting_party_id, origin,
         pricing_plan_id, billing_type, plan_name, total_amount, status, start_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'admin', ?, 'one_time', 'TEST PAYMENT GATEWAY PLAN', 1490.00, 'active', CURDATE(), NOW(), NOW())
    `,
    [enrollmentId, STUDENT_ID, FIN_COURSE_ID, contractingPartyId, PRICING_PLAN_ID]
  );

  financialContractId = contractResult.insertId;
});

async function createTestInvoice(amount = 500) {
  invoiceCounter += 1;

  const [result] = await db.promise().query(
    `
      INSERT INTO invoices
        (financial_contract_id, invoice_type, installment_number, description, amount, due_date, status, created_at, updated_at)
      VALUES (?, 'monthly_payment', ?, ?, ?, DATE_ADD(CURDATE(), INTERVAL 10 DAY), 'pending', NOW(), NOW())
    `,
    [financialContractId, invoiceCounter, `TEST PAYMENT GATEWAY invoice ${invoiceCounter}`, amount]
  );

  createdInvoiceIds.push(result.insertId);

  return result.insertId;
}

async function approveViaSimulatedGateway(gatewayPaymentId) {
  simulatedGateway.simulateApproval(gatewayPaymentId);

  return processGatewayPaymentUpdate(db, {
    gateway: "simulated",
    gatewayPaymentId,
    gatewayEventId: null,
    source: "simulated_gateway",
  });
}

async function countNotifications(type, sourceId) {
  const [rows] = await db
    .promise()
    .query("SELECT COUNT(*) AS total FROM notifications WHERE type = ? AND source_id = ?", [type, sourceId]);

  return Number(rows[0].total);
}

async function countFinancialEvents(eventType, invoiceId) {
  const [rows] = await db
    .promise()
    .query("SELECT COUNT(*) AS total FROM financial_events WHERE event_type = ? AND invoice_id = ?", [eventType, invoiceId]);

  return Number(rows[0].total);
}

after(async () => {
  if (createdInvoiceIds.length > 0) {
    const placeholders = createdInvoiceIds.map(() => "?").join(",");

    await retryOnDeadlock(() =>
      db.promise().query(
        `UPDATE invoices SET status = 'cancelled' WHERE id IN (${placeholders}) AND status NOT IN ('paid', 'cancelled', 'refunded')`,
        createdInvoiceIds
      )
    );

    await retryOnDeadlock(() =>
      db.promise().query(
        `
          DELETE n FROM notifications n
          WHERE (n.type IN ('financial.invoice.changed', 'financial.invoice.cancelled')
                 AND n.source_id IN (${placeholders}))
             OR (n.type IN ('financial.payment.approved', 'financial.payment.refunded', 'admin.payment.rejected', 'admin.financial.payment.received')
                 AND n.source_id IN (SELECT id FROM payments WHERE invoice_id IN (${placeholders})))
        `,
        [...createdInvoiceIds, ...createdInvoiceIds]
      )
    );

    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM invoice_collection_actions WHERE invoice_id IN (${placeholders})`, createdInvoiceIds)
    );

    await retryOnDeadlock(() =>
      db.promise().query(
        `DELETE FROM payment_events WHERE payment_id IN (SELECT id FROM payments WHERE invoice_id IN (${placeholders}))`,
        createdInvoiceIds
      )
    );

    await retryOnDeadlock(() =>
      db.promise().query(
        `DELETE FROM financial_events WHERE invoice_id IN (${placeholders}) OR payment_id IN (SELECT id FROM payments WHERE invoice_id IN (${placeholders}))`,
        [...createdInvoiceIds, ...createdInvoiceIds]
      )
    );

    await retryOnDeadlock(() => db.promise().query(`DELETE FROM payments WHERE invoice_id IN (${placeholders})`, createdInvoiceIds));

    await retryOnDeadlock(() => db.promise().query(`DELETE FROM invoices WHERE id IN (${placeholders})`, createdInvoiceIds));
  }

  if (financialContractId) {
    const [contractRows] = await db
      .promise()
      .query("SELECT enrollment_id FROM financial_contracts WHERE id = ?", [financialContractId]);

    await retryOnDeadlock(() => db.promise().query("DELETE FROM financial_contracts WHERE id = ?", [financialContractId]));

    if (contractRows[0]) {
      await retryOnDeadlock(() => db.promise().query("DELETE FROM enrollments WHERE id = ?", [contractRows[0].enrollment_id]));
    }
  }

  await db.promise().end();
});

// -----------------------------------------------------------------
// Criação: propriedade, valor a partir do banco, guardas de estado
// da fatura (59)
// -----------------------------------------------------------------

test("student creates a PIX payment for their own pending invoice", async () => {
  const invoiceId = await createTestInvoice(347.5);

  const result = await createInvoicePayment(db, { userId: STUDENT_USER_ID, invoiceId, paymentMethod: "pix" });

  assert.equal(result.status, "pending");
  assert.equal(result.amount, 347.5);
  assert.ok(result.pixQrCode);
  assert.ok(result.pixCopyPaste);
});

test("extra client-supplied fields (amount, status) are never read -- amount always comes from the invoice", async () => {
  const invoiceId = await createTestInvoice(199);

  const result = await createInvoicePayment(db, {
    userId: STUDENT_USER_ID,
    invoiceId,
    paymentMethod: "pix",
    amount: 1, // precisa ser ignorado -- a assinatura de createInvoicePayment nem sequer desestrutura isto
    status: "approved",
    studentId: 999,
  });

  assert.equal(result.amount, 199);
  assert.equal(result.status, "pending");

  const [[row]] = await db.promise().query("SELECT amount, status FROM payments WHERE id = ?", [result.paymentId]);

  assert.equal(Number(row.amount), 199);
  assert.equal(row.status, "pending");
});

test("a student cannot pay another student's invoice (IDOR) -- 404, not another student's data", async () => {
  const invoiceId = await createTestInvoice(250);

  await assert.rejects(
    () => createInvoicePayment(db, { userId: OTHER_STUDENT_USER_ID, invoiceId, paymentMethod: "pix" }),
    (error) => {
      assert.equal(error.statusCode, 404);
      return true;
    }
  );
});

test("a paid invoice cannot be paid again -- 409", async () => {
  const invoiceId = await createTestInvoice(300);

  const first = await createInvoicePayment(db, { userId: STUDENT_USER_ID, invoiceId, paymentMethod: "pix" });

  const [[firstRow]] = await db.promise().query("SELECT gateway_payment_id FROM payments WHERE id = ?", [first.paymentId]);

  await approveViaSimulatedGateway(firstRow.gateway_payment_id);

  await assert.rejects(
    () => createInvoicePayment(db, { userId: STUDENT_USER_ID, invoiceId, paymentMethod: "pix" }),
    (error) => {
      assert.equal(error.statusCode, 409);
      return true;
    }
  );
});

test("a cancelled invoice is rejected -- 409", async () => {
  const invoiceId = await createTestInvoice(300);

  await db.promise().query("UPDATE invoices SET status = 'cancelled' WHERE id = ?", [invoiceId]);

  await assert.rejects(
    () => createInvoicePayment(db, { userId: STUDENT_USER_ID, invoiceId, paymentMethod: "pix" }),
    (error) => {
      assert.equal(error.statusCode, 409);
      return true;
    }
  );
});

test("a refunded invoice is rejected -- 409", async () => {
  const invoiceId = await createTestInvoice(300);

  await db.promise().query("UPDATE invoices SET status = 'refunded' WHERE id = ?", [invoiceId]);

  await assert.rejects(
    () => createInvoicePayment(db, { userId: STUDENT_USER_ID, invoiceId, paymentMethod: "pix" }),
    (error) => {
      assert.equal(error.statusCode, 409);
      return true;
    }
  );
});

test("a double click (two sequential create calls) creates a fresh attempt instead of reusing the pending one -- simulated gateway never reuses (avoids the infinite-spinner bug when its in-memory store is reset by a backend restart)", async () => {
  const invoiceId = await createTestInvoice(180);

  const first = await createInvoicePayment(db, { userId: STUDENT_USER_ID, invoiceId, paymentMethod: "pix" });
  const second = await createInvoicePayment(db, { userId: STUDENT_USER_ID, invoiceId, paymentMethod: "pix" });

  assert.notEqual(second.paymentId, first.paymentId);

  const [rows] = await db.promise().query("SELECT id FROM payments WHERE invoice_id = ?", [invoiceId]);

  assert.equal(rows.length, 2);
});

// -----------------------------------------------------------------
// Normalização do status 'expired' -- expiração lazy de tentativas
// PIX/boleto vencidas, disparada dentro de startInvoicePayment antes
// da decisão de reaproveitamento (isReusableAttempt)
// -----------------------------------------------------------------

test("a boleto attempt still within its due date is not reused -- simulated gateway always creates a fresh attempt, old one is left untouched", async () => {
  const invoiceId = await createTestInvoice(360);

  const first = await createInvoicePayment(db, { userId: STUDENT_USER_ID, invoiceId, paymentMethod: "boleto" });
  const second = await createInvoicePayment(db, { userId: STUDENT_USER_ID, invoiceId, paymentMethod: "boleto" });

  assert.notEqual(second.paymentId, first.paymentId);
  assert.equal(second.status, "pending");

  const [rows] = await db.promise().query("SELECT id, status FROM payments WHERE invoice_id = ?", [invoiceId]);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.status === "pending"));
});

test("a PIX attempt past its own pix_expires_at is normalized to expired, a fresh attempt gets a different id, and the invoice stays pending", async () => {
  const invoiceId = await createTestInvoice(210);

  const first = await createInvoicePayment(db, { userId: STUDENT_USER_ID, invoiceId, paymentMethod: "pix" });

  await db.promise().query("UPDATE payments SET pix_expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = ?", [
    first.paymentId,
  ]);

  const second = await createInvoicePayment(db, { userId: STUDENT_USER_ID, invoiceId, paymentMethod: "pix" });

  assert.notEqual(second.paymentId, first.paymentId);
  assert.equal(second.status, "pending");

  const [[firstRow]] = await db.promise().query("SELECT status FROM payments WHERE id = ?", [first.paymentId]);
  assert.equal(firstRow.status, "expired");

  const [[invoiceRow]] = await db.promise().query("SELECT status FROM invoices WHERE id = ?", [invoiceId]);
  assert.equal(invoiceRow.status, "pending");

  const [events] = await db.promise().query(
    "SELECT event_type, previous_status, new_status, source FROM payment_events WHERE payment_id = ? ORDER BY id DESC LIMIT 1",
    [first.paymentId]
  );
  assert.equal(events[0].event_type, "payment_expired");
  assert.equal(events[0].previous_status, "pending");
  assert.equal(events[0].new_status, "expired");
  assert.equal(events[0].source, "system");
});

test("a boleto attempt past its own boleto_due_date is normalized to expired and a new attempt can be created", async () => {
  const invoiceId = await createTestInvoice(360);

  const first = await createInvoicePayment(db, { userId: STUDENT_USER_ID, invoiceId, paymentMethod: "boleto" });

  await db.promise().query("UPDATE payments SET boleto_due_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY) WHERE id = ?", [
    first.paymentId,
  ]);

  const second = await createInvoicePayment(db, { userId: STUDENT_USER_ID, invoiceId, paymentMethod: "boleto" });

  assert.notEqual(second.paymentId, first.paymentId);
  assert.equal(second.status, "pending");

  const [[firstRow]] = await db.promise().query("SELECT status FROM payments WHERE id = ?", [first.paymentId]);
  assert.equal(firstRow.status, "expired");
});

test("expireDuePaymentAttempts never touches an approved payment even with a past pix_expires_at", async () => {
  const invoiceId = await createTestInvoice(300);

  const payment = await createInvoicePayment(db, { userId: STUDENT_USER_ID, invoiceId, paymentMethod: "pix" });

  const [[row]] = await db.promise().query("SELECT gateway_payment_id FROM payments WHERE id = ?", [payment.paymentId]);
  await approveViaSimulatedGateway(row.gateway_payment_id);

  await db.promise().query("UPDATE payments SET pix_expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = ?", [
    payment.paymentId,
  ]);

  await withTransaction(db, (connection) => expireDuePaymentAttempts(connection, invoiceId));

  const [[after]] = await db.promise().query("SELECT status FROM payments WHERE id = ?", [payment.paymentId]);
  assert.equal(after.status, "approved");
});

test("expireDuePaymentAttempts never touches rejected, cancelled or refunded payments even past their own deadline", async () => {
  const invoiceId = await createTestInvoice(150);

  async function insertTerminalAttempt(status, paymentMethod, extraColumn, extraValue) {
    const [result] = await db.promise().query(
      `
        INSERT INTO payments (invoice_id, gateway, gateway_payment_id, source, payment_method, amount, currency, status, ${extraColumn})
        VALUES (?, 'simulated', ?, 'gateway', ?, 150, 'BRL', ?, ?)
      `,
      [invoiceId, `sim_${status}_${invoiceId}`, paymentMethod, status, extraValue]
    );

    return result.insertId;
  }

  const rejectedId = await insertTerminalAttempt("rejected", "pix", "pix_expires_at", "2000-01-01 00:00:00");
  const cancelledId = await insertTerminalAttempt("cancelled", "pix", "pix_expires_at", "2000-01-01 00:00:00");
  const refundedId = await insertTerminalAttempt("refunded", "boleto", "boleto_due_date", "2000-01-01");

  await withTransaction(db, (connection) => expireDuePaymentAttempts(connection, invoiceId));

  const [rows] = await db.promise().query("SELECT id, status FROM payments WHERE id IN (?, ?, ?)", [
    rejectedId,
    cancelledId,
    refundedId,
  ]);

  const statusById = Object.fromEntries(rows.map((row) => [row.id, row.status]));

  assert.equal(statusById[rejectedId], "rejected");
  assert.equal(statusById[cancelledId], "cancelled");
  assert.equal(statusById[refundedId], "refunded");
});

test("selecting credit_card without a cardToken returns a 400 validation error and never inserts a payment row", async () => {
  const invoiceId = await createTestInvoice(500);

  await assert.rejects(
    () => createInvoicePayment(db, { userId: STUDENT_USER_ID, invoiceId, paymentMethod: "credit_card" }),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    }
  );

  const [rows] = await db.promise().query("SELECT id FROM payments WHERE invoice_id = ?", [invoiceId]);
  assert.equal(rows.length, 0);
});

test("a credit_card attempt with a valid token is approved immediately (simulated gateway), never subject to time-based expiration", async () => {
  const invoiceId = await createTestInvoice(400);

  const result = await startInvoicePayment(db, {
    invoiceId,
    paymentMethod: "credit_card",
    cardToken: "sim_card_valid_token",
    cardInstallments: 1,
    accessContext: { scope: "student", studentId: STUDENT_ID, userId: STUDENT_USER_ID },
  });

  assert.equal(result.status, "approved");

  const [[invoiceRow]] = await db.promise().query("SELECT status FROM invoices WHERE id = ?", [invoiceId]);
  assert.equal(invoiceRow.status, "paid");
});

test("a credit_card attempt with the simulated declined token is rejected, and stays rejected (never expired) afterwards", async () => {
  const invoiceId = await createTestInvoice(400);

  const result = await startInvoicePayment(db, {
    invoiceId,
    paymentMethod: "credit_card",
    cardToken: simulatedGateway.SIMULATED_DECLINED_CARD_TOKEN,
    cardInstallments: 1,
    accessContext: { scope: "student", studentId: STUDENT_ID, userId: STUDENT_USER_ID },
  });

  assert.equal(result.status, "rejected");

  await withTransaction(db, (connection) => expireDuePaymentAttempts(connection, invoiceId));

  const [[row]] = await db.promise().query("SELECT status FROM payments WHERE id = ?", [result.paymentId]);
  assert.equal(row.status, "rejected");

  // Rejeição síncrona (invoicePaymentService.js) também notifica
  // admins -- não é só o caminho assíncrono via webhook.
  assert.equal(await countNotifications("admin.payment.rejected", result.paymentId), 1);

  const [[notification]] = await db
    .promise()
    .query("SELECT category, priority FROM notifications WHERE type = 'admin.payment.rejected' AND source_id = ?", [
      result.paymentId,
    ]);

  assert.equal(notification.category, "financial");
  assert.equal(notification.priority, "high");
});

test("admin.payment.rejected: transição assíncrona (webhook) para rejected notifica admins uma única vez, reprocessamento não duplica", async () => {
  const invoiceId = await createTestInvoice(600);

  const gatewayPaymentId = `mp_reject_test_${Date.now()}`;

  const [paymentResult] = await db.promise().query(
    `
      INSERT INTO payments (invoice_id, gateway, gateway_payment_id, source, payment_method, amount, currency, status)
      VALUES (?, 'mercado_pago', ?, 'gateway', 'pix', 600, 'BRL', 'pending')
    `,
    [invoiceId, gatewayPaymentId]
  );

  const paymentId = paymentResult.insertId;

  const originalGetPayment = mercadoPagoGateway.getPayment;

  try {
    mercadoPagoGateway.getPayment = async () => ({
      status: "rejected",
      gatewayPaymentId,
      gatewayStatus: "rejected",
      gatewayStatusDetail: "cc_rejected_insufficient_amount",
    });

    const firstUpdate = await processGatewayPaymentUpdate(db, {
      gateway: "mercado_pago",
      gatewayPaymentId,
      gatewayEventId: `evt-reject-${Date.now()}`,
      source: "gateway_webhook",
    });

    assert.equal(firstUpdate.applied, true);
    assert.equal(firstUpdate.reason, "rejected");

    assert.equal(await countNotifications("admin.payment.rejected", paymentId), 1);

    // Reentrega do mesmo webhook (mesmo gatewayEventId) -- barrada
    // mais acima por payment_events.gateway_event_id antes mesmo de
    // chegar em applyTerminalNonApproval, então não pode duplicar a
    // notificação.
    const secondUpdate = await processGatewayPaymentUpdate(db, {
      gateway: "mercado_pago",
      gatewayPaymentId,
      gatewayEventId: `evt-reject-retry-${Date.now()}`,
      source: "gateway_webhook",
    });

    assert.equal(secondUpdate.applied, false);
    assert.equal(secondUpdate.reason, "same_status_replay");

    assert.equal(await countNotifications("admin.payment.rejected", paymentId), 1);
  } finally {
    mercadoPagoGateway.getPayment = originalGetPayment;
  }
});

test("GET payment by id enforces the same ownership chain -- another student gets 404", async () => {
  const invoiceId = await createTestInvoice(220);
  const created = await createInvoicePayment(db, { userId: STUDENT_USER_ID, invoiceId, paymentMethod: "pix" });

  const owned = await getInvoicePaymentByUser(db, { userId: STUDENT_USER_ID, paymentId: created.paymentId });
  assert.equal(owned.paymentId, created.paymentId);

  await assert.rejects(
    () => getInvoicePaymentByUser(db, { userId: OTHER_STUDENT_USER_ID, paymentId: created.paymentId }),
    (error) => {
      assert.equal(error.statusCode, 404);
      return true;
    }
  );
});

// -----------------------------------------------------------------
// Atualizações de status do gateway (motor do webhook): idempotência,
// ordenação, validação (60, 61, 63)
// -----------------------------------------------------------------

test("approving a PIX payment marks the invoice paid, recalculates the contract, and notifies once", async () => {
  const invoiceId = await createTestInvoice(410);

  const created = await createInvoicePayment(db, { userId: STUDENT_USER_ID, invoiceId, paymentMethod: "pix" });

  const [[row]] = await db.promise().query("SELECT gateway_payment_id FROM payments WHERE id = ?", [created.paymentId]);

  const result = await approveViaSimulatedGateway(row.gateway_payment_id);

  assert.equal(result.applied, true);

  const [[invoiceRow]] = await db.promise().query("SELECT status FROM invoices WHERE id = ?", [invoiceId]);
  assert.equal(invoiceRow.status, "paid");

  assert.equal(await countFinancialEvents("invoice_paid", invoiceId), 1);
  assert.equal(await countNotifications("financial.payment.approved", created.paymentId), 1);
  assert.ok(await countNotifications("admin.financial.payment.received", created.paymentId) >= 1);
});

test("the same approval delivered 10 times only produces one paid invoice and one notification", async () => {
  const invoiceId = await createTestInvoice(275);

  const created = await createInvoicePayment(db, { userId: STUDENT_USER_ID, invoiceId, paymentMethod: "pix" });

  const [[row]] = await db.promise().query("SELECT gateway_payment_id FROM payments WHERE id = ?", [created.paymentId]);

  simulatedGateway.simulateApproval(row.gateway_payment_id);

  for (let i = 0; i < 10; i += 1) {
    await processGatewayPaymentUpdate(db, {
      gateway: "simulated",
      gatewayPaymentId: row.gateway_payment_id,
      gatewayEventId: null,
      source: "simulated_gateway",
    });
  }

  assert.equal(await countFinancialEvents("invoice_paid", invoiceId), 1);
  assert.equal(await countNotifications("financial.payment.approved", created.paymentId), 1);
  assert.ok(await countNotifications("admin.financial.payment.received", created.paymentId) >= 1);
});

test("a gateway_event_id repeated across deliveries is de-duplicated via payment_events.gateway_event_id", async () => {
  const invoiceId = await createTestInvoice(260);

  const created = await createInvoicePayment(db, { userId: STUDENT_USER_ID, invoiceId, paymentMethod: "pix" });

  const [[row]] = await db.promise().query("SELECT gateway_payment_id FROM payments WHERE id = ?", [created.paymentId]);

  simulatedGateway.simulateApproval(row.gateway_payment_id);

  const eventId = `test-dedup-${Date.now()}`;

  const first = await processGatewayPaymentUpdate(db, {
    gateway: "simulated",
    gatewayPaymentId: row.gateway_payment_id,
    gatewayEventId: eventId,
    source: "simulated_gateway",
  });

  const second = await processGatewayPaymentUpdate(db, {
    gateway: "simulated",
    gatewayPaymentId: row.gateway_payment_id,
    gatewayEventId: eventId,
    source: "simulated_gateway",
  });

  assert.equal(first.applied, true);
  assert.equal(second.applied, false);
  assert.equal(second.reason, "duplicate_delivery");

  const [[count]] = await db.promise().query("SELECT COUNT(*) AS n FROM payment_events WHERE gateway_event_id = ?", [eventId]);
  assert.equal(count.n, 1);
});

test("a notification for an unknown gateway_payment_id does not throw and is not applied", async () => {
  const result = await processGatewayPaymentUpdate(db, {
    gateway: "simulated",
    gatewayPaymentId: "sim_pix_does_not_exist",
    gatewayEventId: "test-unknown",
    source: "gateway_webhook",
  });

  assert.equal(result.matched, false);
  assert.equal(result.reason, "unknown_payment");
});

test("a stale 'pending' notification arriving after 'approved' does not move the payment backwards", async () => {
  const invoiceId = await createTestInvoice(300);

  const created = await createInvoicePayment(db, { userId: STUDENT_USER_ID, invoiceId, paymentMethod: "pix" });

  const [[row]] = await db.promise().query("SELECT gateway_payment_id FROM payments WHERE id = ?", [created.paymentId]);

  await approveViaSimulatedGateway(row.gateway_payment_id);

  const [[beforeStatus]] = await db.promise().query("SELECT status FROM payments WHERE id = ?", [created.paymentId]);
  assert.equal(beforeStatus.status, "approved");

  const originalGetPayment = simulatedGateway.getPayment;

  try {
    simulatedGateway.getPayment = async () => ({
      gatewayPaymentId: row.gateway_payment_id,
      status: "pending",
      gatewayStatus: "pending",
      amount: 300,
      currency: "BRL",
      externalReference: `invoice:${invoiceId}:payment:${created.paymentId}`,
    });

    const result = await processGatewayPaymentUpdate(db, {
      gateway: "simulated",
      gatewayPaymentId: row.gateway_payment_id,
      gatewayEventId: "test-stale-pending",
      source: "gateway_webhook",
    });

    assert.equal(result.applied, false);
    assert.equal(result.reason, "stale_out_of_order_transition");
  } finally {
    simulatedGateway.getPayment = originalGetPayment;
  }

  const [[afterStatus]] = await db.promise().query("SELECT status FROM payments WHERE id = ?", [created.paymentId]);
  assert.equal(afterStatus.status, "approved");
});

test("an amount mismatch between the gateway and the local payment is not applied", async () => {
  const invoiceId = await createTestInvoice(300);

  const created = await createInvoicePayment(db, { userId: STUDENT_USER_ID, invoiceId, paymentMethod: "pix" });

  const [[row]] = await db.promise().query("SELECT gateway_payment_id, status FROM payments WHERE id = ?", [created.paymentId]);

  const originalGetPayment = simulatedGateway.getPayment;

  try {
    simulatedGateway.getPayment = async () => ({
      gatewayPaymentId: row.gateway_payment_id,
      status: "approved",
      gatewayStatus: "approved",
      amount: 999999, // não bate com os 300 da fatura
      currency: "BRL",
      externalReference: `invoice:${invoiceId}:payment:${created.paymentId}`,
    });

    const result = await processGatewayPaymentUpdate(db, {
      gateway: "simulated",
      gatewayPaymentId: row.gateway_payment_id,
      gatewayEventId: "test-amount-mismatch",
      source: "gateway_webhook",
    });

    assert.equal(result.applied, false);
    assert.equal(result.reason, "validation_mismatch");
  } finally {
    simulatedGateway.getPayment = originalGetPayment;
  }

  const [[invoiceRow]] = await db.promise().query("SELECT status FROM invoices WHERE id = ?", [invoiceId]);
  assert.equal(invoiceRow.status, "pending");
});

test("two concurrent approvals of the same payment only produce one paid invoice (lock + idempotency)", async () => {
  const invoiceId = await createTestInvoice(500);

  const created = await createInvoicePayment(db, { userId: STUDENT_USER_ID, invoiceId, paymentMethod: "pix" });

  const [[row]] = await db.promise().query("SELECT gateway_payment_id FROM payments WHERE id = ?", [created.paymentId]);

  simulatedGateway.simulateApproval(row.gateway_payment_id);

  const [resultA, resultB] = await Promise.all([
    processGatewayPaymentUpdate(db, {
      gateway: "simulated",
      gatewayPaymentId: row.gateway_payment_id,
      gatewayEventId: null,
      source: "simulated_gateway",
    }),
    processGatewayPaymentUpdate(db, {
      gateway: "simulated",
      gatewayPaymentId: row.gateway_payment_id,
      gatewayEventId: null,
      source: "simulated_gateway",
    }),
  ]);

  assert.equal([resultA.applied, resultB.applied].filter(Boolean).length, 1);
  assert.equal(await countFinancialEvents("invoice_paid", invoiceId), 1);

  const [[invoiceRow]] = await db.promise().query("SELECT status FROM invoices WHERE id = ?", [invoiceId]);
  assert.equal(invoiceRow.status, "paid");
});

// -----------------------------------------------------------------
// Assinatura do webhook do Mercado Pago (parte da seção 60 -- uma
// assinatura forjada/inválida precisa ser rejeitada). Teste unitário
// puro, sem banco, sem chamada HTTP real ao Mercado Pago.
// -----------------------------------------------------------------

test("mercadoPagoGateway.verifyWebhook rejects a forged signature", () => {
  process.env.MERCADO_PAGO_WEBHOOK_SECRET = "test-secret";

  assert.throws(
    () =>
      mercadoPagoGateway.verifyWebhook({
        headers: { "x-signature": "ts=1700000000,v1=deadbeef", "x-request-id": "req-1" },
        query: { "data.id": "123456" },
      }),
    (error) => {
      assert.equal(error.code, "INVALID_WEBHOOK_SIGNATURE");
      return true;
    }
  );
});

test("mercadoPagoGateway.verifyWebhook accepts a correctly computed signature", () => {
  const secret = "test-secret";
  process.env.MERCADO_PAGO_WEBHOOK_SECRET = secret;

  const ts = Math.floor(Date.now() / 1000);
  const dataId = "123456";
  const requestId = "req-2";

  const crypto = require("crypto");
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const hash = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  assert.doesNotThrow(() =>
    mercadoPagoGateway.verifyWebhook({
      headers: { "x-signature": `ts=${ts},v1=${hash}`, "x-request-id": requestId },
      query: { "data.id": dataId },
    })
  );

  // Checagem de sanidade: o manifest deste teste bate com o próprio
  // validador do SDK (não é uma reimplementação duplicada que possa
  // divergir dele).
  assert.doesNotThrow(() =>
    WebhookSignatureValidator.validate({
      xSignature: `ts=${ts},v1=${hash}`,
      xRequestId: requestId,
      dataId,
      secret,
    })
  );
});

// -----------------------------------------------------------------
// Reembolso: simulado, manual, e um gateway real mockado (62, 63)
// -----------------------------------------------------------------

test("refunding a gateway (simulated) payment calls the gateway and marks it refunded", async () => {
  const invoiceId = await createTestInvoice(320);

  const created = await createInvoicePayment(db, { userId: STUDENT_USER_ID, invoiceId, paymentMethod: "pix" });

  const [[row]] = await db.promise().query("SELECT gateway_payment_id FROM payments WHERE id = ?", [created.paymentId]);

  await approveViaSimulatedGateway(row.gateway_payment_id);

  const refundResult = await refundPayment(db, {
    paymentId: created.paymentId,
    reason: "aluno desistiu do curso",
    actorUserId: ADMIN_ACTOR_USER_ID,
  });

  assert.equal(refundResult.paymentStatus, "refunded");

  const [[eventRow]] = await db
    .promise()
    .query("SELECT COUNT(*) AS n FROM payment_events WHERE payment_id = ? AND event_type = 'payment_refunded'", [
      created.paymentId,
    ]);

  assert.equal(eventRow.n, 1);
});

test("refunding a manual (admin-recorded) payment never calls any payment gateway", async () => {
  const invoiceId = await createTestInvoice(500);

  const manual = await registerManualPayment(db, {
    invoiceId,
    amount: 500,
    paymentMethod: "pix",
    paymentDate: new Date().toISOString(),
    reason: "pagamento em dinheiro confirmado na secretaria",
    actorUserId: ADMIN_ACTOR_USER_ID,
  });

  const [[paymentRow]] = await db.promise().query("SELECT gateway, source FROM payments WHERE id = ?", [manual.paymentId]);
  assert.equal(paymentRow.gateway, "manual");
  assert.equal(paymentRow.source, "admin_manual");

  // "manual" não é um adaptador de gateway registrado -- se o desvio
  // baseado em source do refundPayment estivesse errado e tentasse
  // resolvê-lo mesmo assim, esta chamada lançaria "Gateway de
  // pagamento desconhecido" em vez de ter sucesso.
  const refundResult = await refundPayment(db, {
    paymentId: manual.paymentId,
    reason: "aluno desistiu antes do início",
    actorUserId: ADMIN_ACTOR_USER_ID,
  });

  assert.equal(refundResult.paymentStatus, "refunded");
});

test("a duplicate refund request on the same payment is rejected -- 409", async () => {
  const invoiceId = await createTestInvoice(500);

  const manual = await registerManualPayment(db, {
    invoiceId,
    amount: 500,
    paymentMethod: "pix",
    paymentDate: new Date().toISOString(),
    reason: "pagamento confirmado manualmente",
    actorUserId: ADMIN_ACTOR_USER_ID,
  });

  await refundPayment(db, { paymentId: manual.paymentId, reason: "primeiro reembolso", actorUserId: ADMIN_ACTOR_USER_ID });

  await assert.rejects(
    () => refundPayment(db, { paymentId: manual.paymentId, reason: "segundo reembolso (duplicado)", actorUserId: ADMIN_ACTOR_USER_ID }),
    (error) => {
      assert.equal(error.statusCode, 409);
      return true;
    }
  );
});

test("refunding a payment processed by a (mocked) real gateway calls it and only refunds locally on success", async () => {
  const invoiceId = await createTestInvoice(600);

  // Ignora o fluxo real de criação de propósito -- este teste tem
  // como alvo somente o caminho de reembolso contra um pagamento
  // processado por um gateway real, mockado conforme a seção 63
  // ("os testes não devem chamar Mercado Pago real").
  const [paymentResult] = await db.promise().query(
    `
      INSERT INTO payments (invoice_id, gateway, gateway_payment_id, source, payment_method, amount, currency, status, paid_at)
      VALUES (?, 'mercado_pago', ?, 'gateway', 'pix', 600, 'BRL', 'approved', NOW())
    `,
    [invoiceId, `mp_test_${Date.now()}`]
  );

  await db.promise().query("UPDATE invoices SET status = 'paid', paid_at = NOW() WHERE id = ?", [invoiceId]);

  const paymentId = paymentResult.insertId;

  const originalRefundPayment = mercadoPagoGateway.refundPayment;

  try {
    mercadoPagoGateway.refundPayment = async () => ({ status: "refunded", gatewayRefundId: "mp_refund_test" });

    const refundResult = await refundPayment(db, {
      paymentId,
      reason: "reembolso solicitado pelo aluno",
      actorUserId: ADMIN_ACTOR_USER_ID,
    });

    assert.equal(refundResult.paymentStatus, "refunded");
  } finally {
    mercadoPagoGateway.refundPayment = originalRefundPayment;
  }
});

test("when the (mocked) real gateway refuses a refund, the local payment stays approved", async () => {
  const invoiceId = await createTestInvoice(600);

  const [paymentResult] = await db.promise().query(
    `
      INSERT INTO payments (invoice_id, gateway, gateway_payment_id, source, payment_method, amount, currency, status, paid_at)
      VALUES (?, 'mercado_pago', ?, 'gateway', 'pix', 600, 'BRL', 'approved', NOW())
    `,
    [invoiceId, `mp_test_${Date.now()}_fail`]
  );

  await db.promise().query("UPDATE invoices SET status = 'paid', paid_at = NOW() WHERE id = ?", [invoiceId]);

  const paymentId = paymentResult.insertId;

  const originalRefundPayment = mercadoPagoGateway.refundPayment;

  try {
    mercadoPagoGateway.refundPayment = async () => ({ status: "failed", failureReason: "insufficient_funds" });

    await assert.rejects(
      () => refundPayment(db, { paymentId, reason: "reembolso solicitado pelo aluno", actorUserId: ADMIN_ACTOR_USER_ID }),
      (error) => {
        assert.equal(error.statusCode, 502);
        return true;
      }
    );
  } finally {
    mercadoPagoGateway.refundPayment = originalRefundPayment;
  }

  const [[row]] = await db.promise().query("SELECT status FROM payments WHERE id = ?", [paymentId]);
  assert.equal(row.status, "approved");
});
