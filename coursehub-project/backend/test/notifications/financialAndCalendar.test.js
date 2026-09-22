const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();

require("../../services/notifications/eventDefinitions");

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");
const { changeInvoiceDueDate } = require("../../services/financial/invoiceService");
const { changeInvoiceAmount } = require("../../services/financial/invoiceAmountService");
const { cancelInvoice } = require("../../services/financial/invoiceCancellationService");
const { registerManualPayment } = require("../../services/financial/paymentService");
const { refundPayment } = require("../../services/financial/paymentRefundService");
const { createEvent, updateEvent, cancelEvent } = require("../../services/calendar/adminCalendarEventService");
const {
  findOrCreateSelfContractingPartyForStudent,
} = require("../../services/financial/contractingPartyService");

// Financial fixture: a disposable enrollment + financial_contract
// created directly via SQL (no service in the codebase creates
// invoices/contracts today -- confirmed during the Etapa 5e
// diagnosis -- so this test builds its own throwaway chain instead
// of mutating real seeded financial data). Student 61 (user 83) has
// no pre-existing enrollment in course 1, chosen specifically to
// avoid colliding with real data.
const STUDENT_ID = 61;
const STUDENT_USER_ID = 83;
const FIN_COURSE_ID = 1;
const PRICING_PLAN_ID = 2;
const ADMIN_ACTOR_USER_ID = 42; // real admin (Felipe Segatto), used elsewhere in this suite already

// Calendar fixture: course 7 / class 7, reusing the enrolled students
// (16/user49, 19/user52) already established in the attendance
// notification tests for the same course -- different notification
// types, no interference.
const CAL_COURSE_ID = 7;
const CAL_CLASS_ID = 7;

let financialContractId;
let invoiceCounter = 0;
const createdInvoiceIds = [];
const createdCalendarEventIds = [];

// Self-heals a leftover fixture from a previous run whose after()
// hook never completed (e.g. was killed, or hit an FK error before
// reaching this cleanup) -- otherwise that stale enrollment row
// permanently blocks every future run's before() with ER_DUP_ENTRY
// on (student_id, course_id). Same FK order as after() below.
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

  const enrollmentId = enrollmentResult.insertId;

  const contractingPartyId = await findOrCreateSelfContractingPartyForStudent(db.promise(), {
    studentId: STUDENT_ID,
  });

  // status = 'active' (not 'pending_payment'): this suite tests
  // ongoing invoice/payment operations on an established contract,
  // not the contract-activation lifecycle (see
  // test/financial/contractingFlow.test.js for that).
  const [contractResult] = await db.promise().query(
    `
      INSERT INTO financial_contracts
        (enrollment_id, student_id, course_id, contracting_party_id, origin,
         pricing_plan_id, billing_type, plan_name, total_amount, status, start_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'admin', ?, 'one_time', 'TEST ETAPA5E PLAN', 1490.00, 'active', CURDATE(), NOW(), NOW())
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
    [financialContractId, invoiceCounter, `TEST ETAPA5E invoice ${invoiceCounter}`, amount]
  );

  createdInvoiceIds.push(result.insertId);

  return result.insertId;
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

async function createTestCalendarEvent(overrides = {}) {
  const result = await createEvent(db, {
    userId: ADMIN_ACTOR_USER_ID,
    payload: {
      event_type: "academic_meeting",
      title: `TEST ETAPA5E event ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      description: "temporary test event",
      start_date: "2026-09-01",
      end_date: null,
      scope_type: "course",
      course_id: CAL_COURSE_ID,
      class_id: null,
      all_day: true,
      ...overrides,
    },
  });

  createdCalendarEventIds.push(result.event.id);

  return result.event;
}

after(async () => {
  if (createdInvoiceIds.length > 0) {
    const placeholders = createdInvoiceIds.map(() => "?").join(",");

    // scheduledReminders.test.js's generateMissingCollectionActions
    // scans every open (pending/processing/overdue) invoice in the
    // whole table, not just its own fixture -- when the two files
    // run concurrently (node --test runs files in parallel
    // processes), it can attach invoice_collection_actions rows to
    // these invoices too, even though this file never calls that
    // service itself. Closing the invoice status FIRST makes it
    // permanently ineligible for that scan, so the
    // invoice_collection_actions delete right after it is final --
    // nothing can re-attach a new row once the status is closed.
    // Without this ordering, a delete-then-recreate race in the gap
    // before the final DELETE FROM invoices intermittently threw
    // ER_ROW_IS_REFERENCED (observed empirically).
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
             OR (n.type IN ('financial.payment.approved', 'financial.payment.refunded')
                 AND n.source_id IN (SELECT id FROM payments WHERE invoice_id IN (${placeholders})))
        `,
        [...createdInvoiceIds, ...createdInvoiceIds]
      )
    );

    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM invoice_collection_actions WHERE invoice_id IN (${placeholders})`, createdInvoiceIds)
    );

    // financial_events/payment_events FK-reference payments -- must
    // go before deleting payments themselves, or the DELETE below
    // throws ER_ROW_IS_REFERENCED and this whole hook aborts without
    // ever reaching db.promise().end(), leaving the process hanging
    // on its own still-open pool connections until MySQL's idle
    // timeout eventually kills them (confirmed empirically: a run
    // that hit this took ~4 minutes to actually exit).
    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM payment_events WHERE payment_id IN (SELECT id FROM payments WHERE invoice_id IN (${placeholders}))`, createdInvoiceIds)
    );

    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM financial_events WHERE invoice_id IN (${placeholders}) OR payment_id IN (SELECT id FROM payments WHERE invoice_id IN (${placeholders}))`, [...createdInvoiceIds, ...createdInvoiceIds])
    );

    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM payments WHERE invoice_id IN (${placeholders})`, createdInvoiceIds)
    );

    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM invoices WHERE id IN (${placeholders})`, createdInvoiceIds)
    );
  }

  if (financialContractId) {
    const [contractRows] = await db
      .promise()
      .query("SELECT enrollment_id FROM financial_contracts WHERE id = ?", [financialContractId]);

    await retryOnDeadlock(() =>
      db.promise().query("DELETE FROM financial_contracts WHERE id = ?", [financialContractId])
    );

    if (contractRows[0]) {
      await retryOnDeadlock(() =>
        db.promise().query("DELETE FROM enrollments WHERE id = ?", [contractRows[0].enrollment_id])
      );
    }
  }

  // Fallback for any invoice orphaned by a previous crashed/killed
  // run (same FK ordering, and the same close-first race fix, as the
  // createdInvoiceIds-based cleanup above).
  await retryOnDeadlock(() =>
    db.promise().query(
      "UPDATE invoices SET status = 'cancelled' WHERE description LIKE 'TEST ETAPA5E invoice %' AND status NOT IN ('paid', 'cancelled', 'refunded')"
    )
  );

  await retryOnDeadlock(() =>
    db.promise().query(
      "DELETE FROM notifications WHERE (type IN ('financial.invoice.changed', 'financial.invoice.cancelled') AND source_id IN (SELECT id FROM invoices WHERE description LIKE 'TEST ETAPA5E invoice %')) OR (type IN ('financial.payment.approved', 'financial.payment.refunded') AND source_id IN (SELECT id FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE description LIKE 'TEST ETAPA5E invoice %')))"
    )
  );

  await retryOnDeadlock(() =>
    db.promise().query(
      "DELETE FROM invoice_collection_actions WHERE invoice_id IN (SELECT id FROM invoices WHERE description LIKE 'TEST ETAPA5E invoice %')"
    )
  );

  await retryOnDeadlock(() =>
    db.promise().query(
      "DELETE FROM payment_events WHERE payment_id IN (SELECT id FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE description LIKE 'TEST ETAPA5E invoice %'))"
    )
  );

  await retryOnDeadlock(() =>
    db.promise().query(
      "DELETE FROM financial_events WHERE invoice_id IN (SELECT id FROM invoices WHERE description LIKE 'TEST ETAPA5E invoice %') OR payment_id IN (SELECT id FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE description LIKE 'TEST ETAPA5E invoice %'))"
    )
  );

  await retryOnDeadlock(() =>
    db.promise().query(
      "DELETE FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE description LIKE 'TEST ETAPA5E invoice %')"
    )
  );

  await retryOnDeadlock(() =>
    db.promise().query("DELETE FROM invoices WHERE description LIKE 'TEST ETAPA5E invoice %'")
  );

  if (createdCalendarEventIds.length > 0) {
    const placeholders = createdCalendarEventIds.map(() => "?").join(",");

    await retryOnDeadlock(() =>
      db.promise().query(
        `
          DELETE FROM notifications
          WHERE type IN ('calendar.event.published', 'calendar.event.changed', 'calendar.event.cancelled')
            AND source_id IN (${placeholders})
        `,
        createdCalendarEventIds
      )
    );

    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM academic_calendar_events WHERE id IN (${placeholders})`, createdCalendarEventIds)
    );
  }

  // Fallback for any calendar event orphaned by a previous crashed/
  // killed run -- notifications.source_id has no real FK to
  // academic_calendar_events (it's a polymorphic column), so
  // deleting the event without deleting its notifications first
  // leaves them permanently orphaned instead of erroring (unlike the
  // FK-enforced tables above). Confirmed this actually happened: an
  // earlier version of this fallback deleted only the event, and 16
  // orphaned notifications (268 real recipient rows, from the
  // institutional-scope test reaching every active user) sat in the
  // database until caught by manual inspection.
  await retryOnDeadlock(() =>
    db.promise().query(
      "DELETE FROM notifications WHERE type IN ('calendar.event.published', 'calendar.event.changed', 'calendar.event.cancelled') AND source_id IN (SELECT id FROM academic_calendar_events WHERE title LIKE 'TEST ETAPA5E event %')"
    )
  );

  await retryOnDeadlock(() =>
    db.promise().query("DELETE FROM academic_calendar_events WHERE title LIKE 'TEST ETAPA5E event %'")
  );

  await db.promise().end();
});

test("changeInvoiceDueDate notifies the enrollment's student", async () => {
  const invoiceId = await createTestInvoice();

  await changeInvoiceDueDate(db, {
    invoiceId,
    dueDate: "2026-12-15",
    reason: "acordo com o aluno",
    actorUserId: ADMIN_ACTOR_USER_ID,
  });

  assert.equal(await countNotifications("financial.invoice.changed", invoiceId), 1);

  const [recipientRows] = await db.promise().query(
    `
      SELECT nr.user_id
      FROM notifications n
      INNER JOIN notification_recipients nr ON nr.notification_id = n.id
      WHERE n.type = 'financial.invoice.changed' AND n.source_id = ?
    `,
    [invoiceId]
  );

  assert.equal(recipientRows.length, 1);
  assert.equal(recipientRows[0].user_id, STUDENT_USER_ID);
});

test("changeInvoiceAmount notifies the enrollment's student", async () => {
  const invoiceId = await createTestInvoice();

  await changeInvoiceAmount(db, {
    invoiceId,
    newAmount: 650,
    reason: "correção de valor",
    actorUserId: ADMIN_ACTOR_USER_ID,
  });

  assert.equal(await countNotifications("financial.invoice.changed", invoiceId), 1);
});

test("changing due date twice notifies twice (each is a genuine change)", async () => {
  const invoiceId = await createTestInvoice();

  await changeInvoiceDueDate(db, {
    invoiceId,
    dueDate: "2026-12-15",
    reason: "primeiro ajuste",
    actorUserId: ADMIN_ACTOR_USER_ID,
  });

  await changeInvoiceDueDate(db, {
    invoiceId,
    dueDate: "2026-12-20",
    reason: "segundo ajuste",
    actorUserId: ADMIN_ACTOR_USER_ID,
  });

  assert.equal(await countNotifications("financial.invoice.changed", invoiceId), 2);
});

test("cancelInvoice notifies the enrollment's student", async () => {
  const invoiceId = await createTestInvoice();

  await cancelInvoice(db, {
    invoiceId,
    reason: "aluno solicitou cancelamento",
    actorUserId: ADMIN_ACTOR_USER_ID,
  });

  assert.equal(await countNotifications("financial.invoice.cancelled", invoiceId), 1);
});

test("registerManualPayment notifies the enrollment's student (payment approved)", async () => {
  const invoiceId = await createTestInvoice(500);

  const result = await registerManualPayment(db, {
    invoiceId,
    amount: 500,
    paymentMethod: "pix",
    paymentDate: new Date().toISOString(),
    reason: "pagamento confirmado manualmente",
    actorUserId: ADMIN_ACTOR_USER_ID,
  });

  assert.equal(await countNotifications("financial.payment.approved", result.paymentId), 1);
});

test("refundPayment notifies the enrollment's student (payment refunded)", async () => {
  const invoiceId = await createTestInvoice(500);

  const paymentResult = await registerManualPayment(db, {
    invoiceId,
    amount: 500,
    paymentMethod: "pix",
    paymentDate: new Date().toISOString(),
    reason: "pagamento confirmado manualmente",
    actorUserId: ADMIN_ACTOR_USER_ID,
  });

  await refundPayment(db, {
    paymentId: paymentResult.paymentId,
    reason: "aluno desistiu do curso",
    actorUserId: ADMIN_ACTOR_USER_ID,
  });

  // 2 total: 1 from the approval, 1 from the refund.
  assert.equal(await countNotifications("financial.payment.approved", paymentResult.paymentId), 1);
  assert.equal(await countNotifications("financial.payment.refunded", paymentResult.paymentId), 1);
});

test("creating a course-scope calendar event notifies exactly the active-enrolled students of that course", async () => {
  const event = await createTestCalendarEvent({ scope_type: "course", course_id: CAL_COURSE_ID, class_id: null });

  const [expectedRows] = await db.promise().query(
    `
      SELECT u.id AS user_id
      FROM enrollments e
      INNER JOIN students s ON s.id = e.student_id
      INNER JOIN users u ON u.id = s.user_id
      WHERE e.course_id = ? AND e.status = 'active' AND s.status = 'active'
    `,
    [CAL_COURSE_ID]
  );

  assert.equal(await countNotifications("calendar.event.published", event.id), 1);

  const [recipientRows] = await db.promise().query(
    `
      SELECT nr.user_id
      FROM notifications n
      INNER JOIN notification_recipients nr ON nr.notification_id = n.id
      WHERE n.type = 'calendar.event.published' AND n.source_id = ?
    `,
    [event.id]
  );

  assert.equal(recipientRows.length, expectedRows.length);
  assert.ok(recipientRows.length > 0);
});

test("creating a class-scope calendar event only reaches that class", async () => {
  const event = await createTestCalendarEvent({
    scope_type: "class",
    course_id: CAL_COURSE_ID,
    class_id: CAL_CLASS_ID,
  });

  const [expectedRows] = await db.promise().query(
    `
      SELECT u.id AS user_id
      FROM enrollments e
      INNER JOIN students s ON s.id = e.student_id
      INNER JOIN users u ON u.id = s.user_id
      WHERE e.class_id = ? AND e.status = 'active' AND s.status = 'active'
    `,
    [CAL_CLASS_ID]
  );

  const expectedIds = expectedRows.map((row) => row.user_id).sort((a, b) => a - b);

  const [recipientRows] = await db.promise().query(
    `
      SELECT nr.user_id
      FROM notifications n
      INNER JOIN notification_recipients nr ON nr.notification_id = n.id
      WHERE n.type = 'calendar.event.published' AND n.source_id = ?
    `,
    [event.id]
  );

  const recipientIds = recipientRows.map((row) => row.user_id).sort((a, b) => a - b);

  assert.ok(expectedIds.length > 0);
  assert.deepEqual(recipientIds, expectedIds);
});

test("institutional-scope calendar event reaches active students and active teachers", async () => {
  const event = await createTestCalendarEvent({
    scope_type: "institutional",
    course_id: null,
    class_id: null,
  });

  const [recipientRows] = await db.promise().query(
    `
      SELECT nr.user_id
      FROM notifications n
      INNER JOIN notification_recipients nr ON nr.notification_id = n.id
      WHERE n.type = 'calendar.event.published' AND n.source_id = ?
    `,
    [event.id]
  );

  const recipientIds = recipientRows.map((row) => row.user_id).sort((a, b) => a - b);

  // Institutional scope is the one notification audience that spans
  // every active student AND every active teacher system-wide -- so,
  // unlike the course/class-scope tests above (narrow to one fixture),
  // it's exposed to any other concurrently-running test file that
  // legitimately creates/deletes a real active student or teacher
  // (e.g. adminUserCreation.test.js exercising the admin user-creation
  // flow). A single query taken after event creation can genuinely
  // disagree with the recipient list that was fixed at creation time
  // by a few milliseconds of unrelated, real activity elsewhere --
  // not a bug in the recipient resolver itself. Retrying a few times
  // lets that transient window pass; a real regression in the
  // resolver would never converge and would still fail here.
  let expectedIds = [];

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const [[studentRows], [teacherRows]] = await Promise.all([
      db.promise().query(
        "SELECT u.id AS user_id FROM students s INNER JOIN users u ON u.id = s.user_id WHERE s.status = 'active' AND u.status = 'active'"
      ),
      db.promise().query(
        "SELECT u.id AS user_id FROM teachers t INNER JOIN users u ON u.id = t.user_id WHERE t.status = 'active' AND u.status = 'active'"
      ),
    ]);

    expectedIds = [...studentRows, ...teacherRows]
      .map((row) => row.user_id)
      .sort((a, b) => a - b);

    if (JSON.stringify(expectedIds) === JSON.stringify(recipientIds)) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  assert.deepEqual(recipientIds, expectedIds);
});

test("updateEvent with a real date change fires calendar.event.changed", async () => {
  const title = `TEST ETAPA5E event ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const event = await createTestCalendarEvent({
    title,
    start_date: "2026-09-01",
    scope_type: "course",
    course_id: CAL_COURSE_ID,
    class_id: null,
  });

  await updateEvent(db, {
    id: event.id,
    payload: {
      event_type: "academic_meeting",
      title,
      description: "temporary test event",
      start_date: "2026-09-15",
      end_date: null,
      scope_type: "course",
      course_id: CAL_COURSE_ID,
      class_id: null,
      all_day: true,
    },
  });

  assert.equal(await countNotifications("calendar.event.changed", event.id), 1);
});

test("updateEvent that only changes the title does not notify (cosmetic, not operational)", async () => {
  const title = `TEST ETAPA5E event ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const event = await createTestCalendarEvent({
    title,
    start_date: "2026-09-01",
    end_date: null,
    scope_type: "course",
    course_id: CAL_COURSE_ID,
    class_id: null,
  });

  await updateEvent(db, {
    id: event.id,
    payload: {
      event_type: "academic_meeting",
      title: `${title} (revisado)`,
      description: "temporary test event",
      start_date: "2026-09-01",
      end_date: null,
      scope_type: "course",
      course_id: CAL_COURSE_ID,
      class_id: null,
      all_day: true,
    },
  });

  assert.equal(await countNotifications("calendar.event.changed", event.id), 0);
});

test("cancelEvent fires calendar.event.cancelled", async () => {
  const event = await createTestCalendarEvent({ start_date: "2026-09-01" });

  await cancelEvent(db, { id: event.id });

  assert.equal(await countNotifications("calendar.event.cancelled", event.id), 1);
});
