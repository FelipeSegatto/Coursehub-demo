const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();

require("../../services/notifications/eventDefinitions");

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");
const {
  generateMissingCollectionActions,
  processDueCollectionActions,
  processCollectionAction,
} = require("../../services/financial/invoiceCollectionActionService");
const { cancelInvoice } = require("../../services/financial/invoiceCancellationService");
const {
  findOrCreateSelfContractingPartyForStudent,
} = require("../../services/financial/contractingPartyService");

// Eighth disjoint fixture: student 59 (user 81), course 4, pricing
// plan 3. Chosen outside every combination already claimed by
// financialAndCalendar.test.js (student 61/course 1) and the
// learning*.test.js fixtures -- see the convention documented across
// this suite. Same "disposable enrollment/contract built directly
// via SQL" approach as financialAndCalendar.test.js, for the same
// reason: no service in this codebase creates invoices.
const STUDENT_ID = 59;
const STUDENT_USER_ID = 81;
const FIN_COURSE_ID = 4;
const PRICING_PLAN_ID = 3;

let financialContractId;
let invoiceCounter = 0;
const createdInvoiceIds = [];
let enrollmentId;

// Self-heals a leftover fixture from a previous run whose after()
// hook never completed -- otherwise a stale enrollment row
// permanently blocks every future run's before() with ER_DUP_ENTRY
// on (student_id, course_id). Same lesson as financialAndCalendar
// .test.js's cleanupStaleFixture.
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

    await db.promise().query(`DELETE FROM invoice_collection_actions WHERE invoice_id IN (${placeholders})`, staleIds);
    await db.promise().query(`DELETE FROM financial_events WHERE invoice_id IN (${placeholders})`, staleIds);
    await db.promise().query(`DELETE FROM invoices WHERE id IN (${placeholders})`, staleIds);
  }

  await db.promise().query(
    `DELETE FROM financial_contracts WHERE enrollment_id IN (SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?)`,
    [STUDENT_ID, FIN_COURSE_ID]
  );

  await db.promise().query("DELETE FROM enrollments WHERE student_id = ? AND course_id = ?", [
    STUDENT_ID,
    FIN_COURSE_ID,
  ]);
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

  enrollmentId = enrollmentResult.insertId;

  const contractingPartyId = await findOrCreateSelfContractingPartyForStudent(db.promise(), {
    studentId: STUDENT_ID,
  });

  // status = 'active' (not 'pending_payment'): this suite tests
  // overdue/collection/lock mechanics on an established contract, not
  // the contract-activation lifecycle.
  const [contractResult] = await db.promise().query(
    `
      INSERT INTO financial_contracts
        (enrollment_id, student_id, course_id, contracting_party_id, origin,
         pricing_plan_id, billing_type, plan_name, total_amount, status, start_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'admin', ?, 'one_time', 'TEST ETAPA5F PLAN', 1960.00, 'active', CURDATE(), NOW(), NOW())
    `,
    [enrollmentId, STUDENT_ID, FIN_COURSE_ID, contractingPartyId, PRICING_PLAN_ID]
  );

  financialContractId = contractResult.insertId;
});

// dueDateExpr is a fixed SQL literal fragment this file controls
// (never user input), used to place an invoice's due_date at a known
// offset from CURDATE() so specific collection actions land on
// "today" for the test.
async function createTestInvoice({ amount = 500, dueDateExpr = "CURDATE()" } = {}) {
  invoiceCounter += 1;

  const [result] = await db.promise().query(
    `
      INSERT INTO invoices
        (financial_contract_id, invoice_type, installment_number, description, amount, due_date, status, created_at, updated_at)
      VALUES (?, 'monthly_payment', ?, ?, ?, ${dueDateExpr}, 'pending', NOW(), NOW())
    `,
    [financialContractId, invoiceCounter, `TEST ETAPA5F invoice ${invoiceCounter}`, amount]
  );

  createdInvoiceIds.push(result.insertId);

  return result.insertId;
}

async function getActions(invoiceId) {
  const [rows] = await db
    .promise()
    .query(
      "SELECT id, action_type, status, scheduled_for FROM invoice_collection_actions WHERE invoice_id = ? ORDER BY scheduled_for ASC",
      [invoiceId]
    );

  return rows;
}

async function countNotifications(type, sourceId) {
  const [rows] = await db
    .promise()
    .query("SELECT COUNT(*) AS total FROM notifications WHERE type = ? AND source_id = ?", [
      type,
      sourceId,
    ]);

  return Number(rows[0].total);
}

after(async () => {
  if (createdInvoiceIds.length > 0) {
    const placeholders = createdInvoiceIds.map(() => "?").join(",");

    await retryOnDeadlock(() =>
      db.promise().query(
        `
          DELETE n FROM notifications n
          WHERE (n.type IN (
                   'financial.invoice.overdue', 'financial.invoice.overdue_charge_warning', 'financial.enrollment.lock_warning',
                   'admin.financial.invoice.overdue', 'admin.financial.invoice.overdue_15_days', 'admin.financial.invoice.overdue_30_days'
                 )
                 AND n.source_id IN (${placeholders}))
             OR (n.type = 'financial.invoice.reminder'
                 AND n.source_id IN (SELECT id FROM invoice_collection_actions WHERE invoice_id IN (${placeholders})))
        `,
        [...createdInvoiceIds, ...createdInvoiceIds]
      )
    );

    if (enrollmentId) {
      await retryOnDeadlock(() =>
        db.promise().query(
          "DELETE FROM notifications WHERE type = 'financial.enrollment.locked' AND source_id = ?",
          [enrollmentId]
        )
      );
    }

    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM financial_events WHERE invoice_id IN (${placeholders})`, createdInvoiceIds)
    );

    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM invoice_collection_actions WHERE invoice_id IN (${placeholders})`, createdInvoiceIds)
    );

    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM invoices WHERE id IN (${placeholders})`, createdInvoiceIds)
    );
  }

  if (financialContractId) {
    await retryOnDeadlock(() =>
      db.promise().query("DELETE FROM financial_contracts WHERE id = ?", [financialContractId])
    );
  }

  if (enrollmentId) {
    await retryOnDeadlock(() => db.promise().query("DELETE FROM enrollments WHERE id = ?", [enrollmentId]));
  }

  // Fallback for any invoice orphaned by a previous crashed/killed
  // run -- financial_events/invoice_collection_actions before
  // invoices, or this throws ER_ROW_IS_REFERENCED (same FK-ordering
  // lesson as financialAndCalendar.test.js).
  await retryOnDeadlock(() =>
    db.promise().query(
      "DELETE FROM notifications WHERE (type IN ('financial.invoice.overdue', 'financial.invoice.overdue_charge_warning', 'financial.enrollment.lock_warning', 'admin.financial.invoice.overdue', 'admin.financial.invoice.overdue_15_days', 'admin.financial.invoice.overdue_30_days') AND source_id IN (SELECT id FROM invoices WHERE description LIKE 'TEST ETAPA5F invoice %')) OR (type = 'financial.invoice.reminder' AND source_id IN (SELECT id FROM invoice_collection_actions WHERE invoice_id IN (SELECT id FROM invoices WHERE description LIKE 'TEST ETAPA5F invoice %')))"
    )
  );

  await retryOnDeadlock(() =>
    db.promise().query(
      "DELETE FROM financial_events WHERE invoice_id IN (SELECT id FROM invoices WHERE description LIKE 'TEST ETAPA5F invoice %')"
    )
  );

  await retryOnDeadlock(() =>
    db.promise().query(
      "DELETE FROM invoice_collection_actions WHERE invoice_id IN (SELECT id FROM invoices WHERE description LIKE 'TEST ETAPA5F invoice %')"
    )
  );

  await retryOnDeadlock(() =>
    db.promise().query("DELETE FROM invoices WHERE description LIKE 'TEST ETAPA5F invoice %'")
  );

  await db.promise().end();
});

test("generateMissingCollectionActions creates all 6 rows with correct offsets", async () => {
  const invoiceId = await createTestInvoice({ dueDateExpr: "DATE_ADD(CURDATE(), INTERVAL 20 DAY)" });

  await generateMissingCollectionActions(db, { invoiceIds: createdInvoiceIds });

  const actions = await getActions(invoiceId);

  assert.equal(actions.length, 6);
  assert.deepEqual(
    actions.map((a) => a.action_type),
    [
      "reminder_3_days_before",
      "due_date_notice",
      "marked_overdue",
      "overdue_charge_10_days",
      "lock_warning_15_days",
      "enrollment_locked_30_days",
    ]
  );
  assert.ok(actions.every((a) => a.status === "pending"));
});

test("generateMissingCollectionActions is idempotent", async () => {
  const invoiceId = await createTestInvoice({ dueDateExpr: "DATE_ADD(CURDATE(), INTERVAL 20 DAY)" });

  await generateMissingCollectionActions(db, { invoiceIds: createdInvoiceIds });
  await generateMissingCollectionActions(db, { invoiceIds: createdInvoiceIds });

  const actions = await getActions(invoiceId);

  assert.equal(actions.length, 6);
});

test("a cancelled invoice never gets collection actions generated", async () => {
  const invoiceId = await createTestInvoice({ dueDateExpr: "DATE_ADD(CURDATE(), INTERVAL 20 DAY)" });

  await cancelInvoice(db, {
    invoiceId,
    reason: "aluno desistiu antes do vencimento",
    actorUserId: 42,
  });

  await generateMissingCollectionActions(db, { invoiceIds: createdInvoiceIds });

  const actions = await getActions(invoiceId);

  assert.equal(actions.length, 0);
});

test("processing due actions only touches what's actually due today, not future ones", async () => {
  const invoiceId = await createTestInvoice({ dueDateExpr: "CURDATE()" });

  await generateMissingCollectionActions(db, { invoiceIds: createdInvoiceIds });
  await processDueCollectionActions(db, { batchSize: 50, invoiceIds: createdInvoiceIds });

  const actions = await getActions(invoiceId);
  const byType = Object.fromEntries(actions.map((a) => [a.action_type, a.status]));

  assert.equal(byType.reminder_3_days_before, "processed");
  assert.equal(byType.due_date_notice, "processed");
  assert.equal(byType.marked_overdue, "pending");
  assert.equal(byType.overdue_charge_10_days, "pending");
  assert.equal(byType.lock_warning_15_days, "pending");
  assert.equal(byType.enrollment_locked_30_days, "pending");

  const reminderActions = actions.filter((a) =>
    ["reminder_3_days_before", "due_date_notice"].includes(a.action_type)
  );

  for (const action of reminderActions) {
    assert.equal(await countNotifications("financial.invoice.reminder", action.id), 1);
  }
});

test("marked_overdue transitions the invoice and notifies once", async () => {
  const invoiceId = await createTestInvoice({ dueDateExpr: "DATE_SUB(CURDATE(), INTERVAL 1 DAY)" });

  await generateMissingCollectionActions(db, { invoiceIds: createdInvoiceIds });
  await processDueCollectionActions(db, { batchSize: 50, invoiceIds: createdInvoiceIds });

  const [[invoiceRow]] = await db.promise().query("SELECT status FROM invoices WHERE id = ?", [invoiceId]);

  assert.equal(invoiceRow.status, "overdue");
  assert.equal(await countNotifications("financial.invoice.overdue", invoiceId), 1);

  // admin.financial.invoice.overdue -- mesma transição, notificação
  // administrativa própria (category=financial), nunca substituindo a
  // do aluno.
  assert.equal(await countNotifications("admin.financial.invoice.overdue", invoiceId), 1);

  const [[adminNotification]] = await db.promise().query(
    "SELECT category FROM notifications WHERE type = 'admin.financial.invoice.overdue' AND source_id = ?",
    [invoiceId]
  );
  assert.equal(adminNotification.category, "financial");

  const [[eventRow]] = await db.promise().query(
    "SELECT event_type, source FROM financial_events WHERE invoice_id = ? AND event_type = 'invoice_marked_overdue'",
    [invoiceId]
  );

  assert.equal(eventRow.source, "system");
});

test("overdue_charge_10_days only warns -- never changes the invoice amount", async () => {
  const invoiceId = await createTestInvoice({
    amount: 500,
    dueDateExpr: "DATE_SUB(CURDATE(), INTERVAL 10 DAY)",
  });

  await generateMissingCollectionActions(db, { invoiceIds: createdInvoiceIds });
  await processDueCollectionActions(db, { batchSize: 50, invoiceIds: createdInvoiceIds });

  assert.equal(await countNotifications("financial.invoice.overdue_charge_warning", invoiceId), 1);

  const [[invoiceRow]] = await db.promise().query("SELECT amount FROM invoices WHERE id = ?", [invoiceId]);

  assert.equal(Number(invoiceRow.amount), 500);
});

test("lock_warning_15_days only warns -- the enrollment stays active", async () => {
  const invoiceId = await createTestInvoice({ dueDateExpr: "DATE_SUB(CURDATE(), INTERVAL 15 DAY)" });

  await generateMissingCollectionActions(db, { invoiceIds: createdInvoiceIds });
  await processDueCollectionActions(db, { batchSize: 50, invoiceIds: createdInvoiceIds });

  assert.equal(await countNotifications("financial.enrollment.lock_warning", invoiceId), 1);

  // admin.financial.invoice.overdue_15_days -- roda incondicionalmente
  // (não existe flag que suprima o aviso de 15 dias), diferente do
  // milestone de 30 dias.
  assert.equal(await countNotifications("admin.financial.invoice.overdue_15_days", invoiceId), 1);

  const [[adminNotification]] = await db.promise().query(
    "SELECT priority FROM notifications WHERE type = 'admin.financial.invoice.overdue_15_days' AND source_id = ?",
    [invoiceId]
  );
  assert.equal(adminNotification.priority, "high");

  const [[enrollmentRow]] = await db.promise().query("SELECT status FROM enrollments WHERE id = ?", [
    enrollmentId,
  ]);

  assert.equal(enrollmentRow.status, "active");
});

test("enrollment_locked_30_days with the kill switch off (default) skips without locking or notifying", async () => {
  assert.notEqual(
    process.env.ENABLE_ENROLLMENT_AUTO_LOCK,
    "true",
    "this test assumes the default (unset/false) switch state"
  );

  const invoiceId = await createTestInvoice({ dueDateExpr: "DATE_SUB(CURDATE(), INTERVAL 30 DAY)" });

  await generateMissingCollectionActions(db, { invoiceIds: createdInvoiceIds });
  await processDueCollectionActions(db, { batchSize: 50, invoiceIds: createdInvoiceIds });

  const actions = await getActions(invoiceId);
  const lockAction = actions.find((a) => a.action_type === "enrollment_locked_30_days");

  assert.equal(lockAction.status, "skipped");
  assert.equal(await countNotifications("financial.enrollment.locked", enrollmentId), 0);

  const [[enrollmentRow]] = await db.promise().query("SELECT status FROM enrollments WHERE id = ?", [
    enrollmentId,
  ]);

  assert.equal(enrollmentRow.status, "active");

  // admin.financial.invoice.overdue_30_days: MESMO com o kill switch
  // desligado, o admin ainda precisa saber que a fatura atingiu 30
  // dias -- esse milestone financeiro é independente do bloqueio
  // automático (que aqui, corretamente, não aconteceu).
  assert.equal(await countNotifications("admin.financial.invoice.overdue_30_days", invoiceId), 1);

  const [[adminNotification]] = await db.promise().query(
    "SELECT message, priority FROM notifications WHERE type = 'admin.financial.invoice.overdue_30_days' AND source_id = ?",
    [invoiceId]
  );
  assert.equal(adminNotification.priority, "urgent");
  assert.match(adminNotification.message, /NÃO foi bloqueada/);

  const [[recipientRow]] = await db
    .promise()
    .query(
      `SELECT action_path FROM notification_recipients WHERE notification_id = (SELECT id FROM notifications WHERE type = 'admin.financial.invoice.overdue_30_days' AND source_id = ?) LIMIT 1`,
      [invoiceId]
    );
  assert.ok(recipientRow, "ao menos um admin deveria ter recebido a notificação de 30 dias");
});

test("enrollment_locked_30_days with the kill switch on actually locks and notifies", async () => {
  const invoiceId = await createTestInvoice({ dueDateExpr: "DATE_SUB(CURDATE(), INTERVAL 30 DAY)" });

  await generateMissingCollectionActions(db, { invoiceIds: createdInvoiceIds });

  const previousEnvValue = process.env.ENABLE_ENROLLMENT_AUTO_LOCK;
  process.env.ENABLE_ENROLLMENT_AUTO_LOCK = "true";

  try {
    await processDueCollectionActions(db, { batchSize: 50, invoiceIds: createdInvoiceIds });
  } finally {
    if (previousEnvValue === undefined) {
      delete process.env.ENABLE_ENROLLMENT_AUTO_LOCK;
    } else {
      process.env.ENABLE_ENROLLMENT_AUTO_LOCK = previousEnvValue;
    }
  }

  const [[enrollmentRow]] = await db.promise().query(
    "SELECT status, lock_reason FROM enrollments WHERE id = ?",
    [enrollmentId]
  );

  assert.equal(enrollmentRow.status, "locked");
  assert.equal(enrollmentRow.lock_reason, "financial_overdue");
  assert.equal(await countNotifications("financial.enrollment.locked", enrollmentId), 1);

  const [[eventRow]] = await db.promise().query(
    "SELECT event_type, source FROM financial_events WHERE enrollment_id = ? AND event_type = 'enrollment_locked_automatically'",
    [enrollmentId]
  );

  assert.equal(eventRow.source, "system");

  // admin.financial.invoice.overdue_30_days também dispara aqui, com
  // enrollmentWasAutoLocked=true refletido na mensagem -- nunca
  // substitui financial.enrollment.locked (o específico do bloqueio),
  // os dois coexistem.
  assert.equal(await countNotifications("admin.financial.invoice.overdue_30_days", invoiceId), 1);

  const [[adminNotification]] = await db.promise().query(
    "SELECT message FROM notifications WHERE type = 'admin.financial.invoice.overdue_30_days' AND source_id = ?",
    [invoiceId]
  );
  assert.match(adminNotification.message, /foi bloqueada automaticamente/);

  // Reactivate directly -- this codebase has no "unlock" service yet
  // (out of scope here), so the test fixes its own side effect
  // rather than leaving the shared enrollment fixture locked for
  // whatever test runs after it in this file.
  await db.promise().query(
    "UPDATE enrollments SET status = 'active', locked_at = NULL, lock_reason = NULL, lock_note = NULL WHERE id = ?",
    [enrollmentId]
  );
});

test("closing an invoice invalidates its still-pending collection actions", async () => {
  const invoiceId = await createTestInvoice({ dueDateExpr: "CURDATE()" });

  await generateMissingCollectionActions(db, { invoiceIds: createdInvoiceIds });

  const beforeCancel = await getActions(invoiceId);
  assert.equal(beforeCancel.filter((a) => a.status === "pending").length, 6);

  await cancelInvoice(db, {
    invoiceId,
    reason: "aluno pagou por fora e pediu cancelamento",
    actorUserId: 42,
  });

  const afterCancel = await getActions(invoiceId);

  assert.equal(afterCancel.length, 0);
});

test("processCollectionAction skips (does not act) when the invoice already left the open states", async () => {
  const invoiceId = await createTestInvoice({ dueDateExpr: "CURDATE()" });

  await generateMissingCollectionActions(db, { invoiceIds: createdInvoiceIds });

  const [actionRows] = await db
    .promise()
    .query("SELECT id FROM invoice_collection_actions WHERE invoice_id = ? AND action_type = 'due_date_notice'", [
      invoiceId,
    ]);

  const actionId = actionRows[0].id;

  // Simulate the narrow race this backstop exists for: the invoice
  // reaches a terminal state through a path that bypasses the normal
  // pending-action DELETE (direct SQL here stands in for that), and
  // the worker still picks the action up.
  await db.promise().query("UPDATE invoices SET status = 'paid', paid_at = NOW() WHERE id = ?", [invoiceId]);

  const result = await processCollectionAction(db, actionId);

  assert.equal(result, "skipped");
  assert.equal(await countNotifications("financial.invoice.reminder", actionId), 0);
});
