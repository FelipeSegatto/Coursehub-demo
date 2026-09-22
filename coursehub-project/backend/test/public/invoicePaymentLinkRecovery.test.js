const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();
require("../../services/notifications/eventDefinitions");

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");

const { createStudentContractWithInitialInvoice } = require("../../services/financial/contractCreationService");
const {
  requestInvoicePaymentLinkByEmail,
} = require("../../services/financial/invoicePaymentLinkRecoveryService");

const RUN_ID = Date.now();
const COURSE_NAME = `TEST INVOICE LINK RECOVERY ${RUN_ID}`;
const ELIGIBLE_EMAIL = `recovery.${RUN_ID}@example.com`;
const NONEXISTENT_EMAIL = `nobody.${RUN_ID}@example.com`;

let courseId;
let planId;
let adminUserId;
let contractId;
let invoiceId;
let studentId;
let studentUserId;

function testCpf(sequence) {
  const digits = String(RUN_ID).slice(-6) + String(sequence).padStart(3, "0");

  return digits.slice(0, 9).padEnd(9, "0") + "00";
}

async function purgeCourseData() {
  if (contractId) {
    await db.promise().query(`DELETE FROM financial_events WHERE financial_contract_id = ?`, [contractId]);
    await db
      .promise()
      .query(
        `DELETE pe FROM payment_events pe INNER JOIN payments p ON p.id = pe.payment_id INNER JOIN invoices i ON i.id = p.invoice_id WHERE i.financial_contract_id = ?`,
        [contractId]
      );
    await db
      .promise()
      .query(`DELETE p FROM payments p INNER JOIN invoices i ON i.id = p.invoice_id WHERE i.financial_contract_id = ?`, [
        contractId,
      ]);

    if (invoiceId) {
      const [notifs] = await db.promise().query(
        `SELECT id FROM notifications WHERE type = 'financial.invoice.payment_link_shared' AND source_id = ?`,
        [invoiceId]
      );

      for (const notification of notifs) {
        await db
          .promise()
          .query(
            `DELETE nd FROM notification_deliveries nd INNER JOIN notification_recipients nr ON nr.id = nd.recipient_id WHERE nr.notification_id = ?`,
            [notification.id]
          );
        await db.promise().query(`DELETE FROM notification_recipients WHERE notification_id = ?`, [notification.id]);
        await db.promise().query(`DELETE FROM notifications WHERE id = ?`, [notification.id]);
      }
    }

    await db.promise().query(`DELETE FROM invoice_payment_access_tokens WHERE invoice_id = ?`, [invoiceId]).catch(() => {});
    await db
      .promise()
      .query(`UPDATE financial_contracts SET activation_invoice_id = NULL, enrollment_id = NULL WHERE id = ?`, [
        contractId,
      ]);
    await db.promise().query(`DELETE FROM invoices WHERE financial_contract_id = ?`, [contractId]);
  }

  await db.promise().query(`DELETE FROM enrollments WHERE course_id = ?`, [courseId]);
  await db.promise().query(`DELETE FROM financial_contracts WHERE course_id = ?`, [courseId]);

  if (studentId) {
    await db.promise().query(`DELETE FROM student_contracting_parties WHERE student_id = ?`, [studentId]);
    await db.promise().query(`DELETE FROM contracting_parties WHERE user_id = ?`, [studentUserId]);
    await db.promise().query(`DELETE FROM account_activation_tokens WHERE user_id = ?`, [studentUserId]);
    await db.promise().query(`DELETE FROM students WHERE id = ?`, [studentId]);
    await db.promise().query(`DELETE FROM users WHERE id = ?`, [studentUserId]);
  }

  await db.promise().query(`DELETE FROM course_pricing_plans WHERE course_id = ?`, [courseId]);
  await db.promise().query(`DELETE FROM courses WHERE id = ?`, [courseId]);
}

before(async () => {
  const [courseResult] = await db.promise().query(
    `INSERT INTO courses (teacher_id, name, description, workload_hours, price, status, nivel, created_at, updated_at)
     VALUES (NULL, ?, 'teste', 10, 0, 'draft', 'Iniciante', NOW(), NOW())`,
    [COURSE_NAME]
  );
  courseId = courseResult.insertId;

  const [planResult] = await db.promise().query(
    `INSERT INTO course_pricing_plans
       (course_id, name, description, billing_type, total_amount, monthly_payment_count,
        monthly_payment_amount, max_card_installments, accepts_pix, accepts_boleto,
        accepts_credit_card, status, created_at, updated_at)
     VALUES (?, 'Plano', NULL, 'one_time', 200.00, NULL, NULL, 1, 1, 1, 1, 'active', NOW(), NOW())`,
    [courseId]
  );
  planId = planResult.insertId;

  const [adminRows] = await db.promise().query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
  adminUserId = adminRows[0].id;

  const result = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: {
        name: `Aluno Teste Recuperação ${RUN_ID}`,
        email: ELIGIBLE_EMAIL,
        birth_date: "2000-05-01",
        cpf: testCpf(1),
        phone: "11999990000",
      },
      contractingPartyMode: "self",
      courseId,
      pricingPlanId: planId,
      billingData: { dueDate: "2026-12-01" },
    },
    adminUserId
  );

  contractId = result.contractId;
  invoiceId = result.invoiceId;
  studentId = result.studentId;

  const [studentRows] = await db.promise().query(`SELECT user_id FROM students WHERE id = ?`, [studentId]);
  studentUserId = studentRows[0].user_id;
});

after(async () => {
  await retryOnDeadlock(() => purgeCourseData());
  await db.promise().end();
});

test("e-mail elegível: reenvia o link pela infraestrutura existente (financial_events + outbox), sem devolver nada ao chamador", async () => {
  const returnValue = await requestInvoicePaymentLinkByEmail(db, { email: ` ${ELIGIBLE_EMAIL.toUpperCase()} ` });

  // Nunca devolve token, URL, invoiceId ou qualquer dado -- a função
  // não tem retorno nenhum, só efeito colateral (reenvio).
  assert.equal(returnValue, undefined);

  const [eventRows] = await db.promise().query(
    `SELECT COUNT(*) AS total FROM financial_events WHERE invoice_id = ? AND event_type = 'invoice_payment_link_sent'`,
    [invoiceId]
  );
  assert.ok(Number(eventRows[0].total) >= 1, "deveria ter reaproveitado sendInvoicePaymentLinkByEmail (financial_events)");

  const [notificationRows] = await db.promise().query(
    `SELECT COUNT(*) AS total FROM notifications WHERE type = 'financial.invoice.payment_link_shared' AND source_id = ?`,
    [invoiceId]
  );
  assert.ok(Number(notificationRows[0].total) >= 1, "deveria ter usado o outbox de notificação existente, não uma fila nova");

  // Nem invoice nem payment novos foram criados -- só o token/evento de reenvio.
  const [invoiceCountRows] = await db.promise().query(
    `SELECT COUNT(*) AS total FROM invoices WHERE financial_contract_id = ?`,
    [contractId]
  );
  assert.equal(Number(invoiceCountRows[0].total), 1);

  const [paymentCountRows] = await db.promise().query(
    `SELECT COUNT(*) AS total FROM payments p INNER JOIN invoices i ON i.id = p.invoice_id WHERE i.financial_contract_id = ?`,
    [contractId]
  );
  assert.equal(Number(paymentCountRows[0].total), 0);
});

test("e-mail sem fatura elegível: não faz nada, silenciosamente, sem lançar erro (resposta do chamador continua idêntica)", async () => {
  const [beforeEvents] = await db.promise().query(
    `SELECT COUNT(*) AS total FROM financial_events WHERE event_type = 'invoice_payment_link_sent'`
  );

  const returnValue = await requestInvoicePaymentLinkByEmail(db, { email: NONEXISTENT_EMAIL });
  assert.equal(returnValue, undefined);

  const [afterEvents] = await db.promise().query(
    `SELECT COUNT(*) AS total FROM financial_events WHERE event_type = 'invoice_payment_link_sent'`
  );

  assert.equal(
    Number(afterEvents[0].total),
    Number(beforeEvents[0].total),
    "e-mail sem fatura elegível não deveria disparar nenhum reenvio"
  );
});

test("e-mail malformado é rejeitado com 400 -- único caso em que a resposta varia, e não revela nada sobre cadastro", async () => {
  await assert.rejects(
    () => requestInvoicePaymentLinkByEmail(db, { email: "not-an-email" }),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    }
  );

  await assert.rejects(
    () => requestInvoicePaymentLinkByEmail(db, { email: "" }),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    }
  );
});
