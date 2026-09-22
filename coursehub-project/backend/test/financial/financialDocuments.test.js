const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();
require("../../services/notifications/eventDefinitions");

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");

const {
  createStudentContractWithInitialInvoice,
} = require("../../services/financial/contractCreationService");
const { registerManualPayment } = require("../../services/financial/paymentService");

const {
  requestContractDocument,
  getContractDocumentStatus,
} = require("../../services/financial/financialContractDocumentService");
const {
  requestInvoiceCopyDocument,
} = require("../../services/financial/invoiceCopyDocumentService");
const {
  requestPaymentReceipt,
} = require("../../services/financial/paymentReceiptDocumentService");

const { runCycle } = require("../../workers/documentGenerationWorker");
const { deleteDocument } = require("../../services/documents/documentStorageService");
const { closeBrowser } = require("../../services/documents/documentRendererService");

const COURSE_NAME = "TEST FINANCIAL DOCUMENTS COURSE";
const RUN_ID = Date.now();

// mysql2 já desserializa colunas JSON automaticamente -- só cai no
// JSON.parse quando por algum motivo vier como string.
function parseSnapshot(value) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

let courseId;
let planId;
let adminUserId;

function testCpf(sequence) {
  const digits = String(RUN_ID).slice(-6) + String(sequence).padStart(3, "0");

  return digits.slice(0, 9).padEnd(9, "0") + "00";
}

function testEmail(label) {
  return `financial.documents.${RUN_ID}.${label}@example.com`;
}

async function purgeUserAuxiliaryData(userId) {
  const [notifs] = await db.promise().query(`SELECT id FROM notifications WHERE actor_user_id = ?`, [userId]);

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

  await db
    .promise()
    .query(
      `DELETE nd FROM notification_deliveries nd INNER JOIN notification_recipients nr ON nr.id = nd.recipient_id WHERE nr.user_id = ?`,
      [userId]
    );
  await db.promise().query(`DELETE FROM notification_recipients WHERE user_id = ?`, [userId]);
}

async function purgeCourseData(targetCourseId) {
  const [contracts] = await db
    .promise()
    .query(`SELECT id FROM financial_contracts WHERE course_id = ?`, [targetCourseId]);

  for (const contract of contracts) {
    const [invoiceRows] = await db
      .promise()
      .query(`SELECT id FROM invoices WHERE financial_contract_id = ?`, [contract.id]);

    for (const invoice of invoiceRows) {
      const [paymentRows] = await db.promise().query(`SELECT id FROM payments WHERE invoice_id = ?`, [invoice.id]);

      for (const payment of paymentRows) {
        const [genDocs] = await db
          .promise()
          .query(`SELECT storage_key FROM generated_documents WHERE subject_type = 'payment' AND subject_id = ?`, [
            payment.id,
          ]);

        for (const doc of genDocs) {
          if (doc.storage_key) await deleteDocument(doc.storage_key).catch(() => {});
        }

        await db.promise().query(`DELETE FROM generated_documents WHERE subject_type = 'payment' AND subject_id = ?`, [
          payment.id,
        ]);
      }

      const [genDocs] = await db
        .promise()
        .query(`SELECT storage_key FROM generated_documents WHERE subject_type = 'invoice' AND subject_id = ?`, [
          invoice.id,
        ]);

      for (const doc of genDocs) {
        if (doc.storage_key) await deleteDocument(doc.storage_key).catch(() => {});
      }

      await db.promise().query(`DELETE FROM generated_documents WHERE subject_type = 'invoice' AND subject_id = ?`, [
        invoice.id,
      ]);
    }

    const [genDocs] = await db
      .promise()
      .query(`SELECT storage_key FROM generated_documents WHERE subject_type = 'financial_contract' AND subject_id = ?`, [
        contract.id,
      ]);

    for (const doc of genDocs) {
      if (doc.storage_key) await deleteDocument(doc.storage_key).catch(() => {});
    }

    await db
      .promise()
      .query(`DELETE FROM generated_documents WHERE subject_type = 'financial_contract' AND subject_id = ?`, [
        contract.id,
      ]);

    await db.promise().query(`DELETE FROM financial_events WHERE financial_contract_id = ?`, [contract.id]);
    await db
      .promise()
      .query(
        `DELETE pe FROM payment_events pe INNER JOIN payments p ON p.id = pe.payment_id INNER JOIN invoices i ON i.id = p.invoice_id WHERE i.financial_contract_id = ?`,
        [contract.id]
      );
    await db
      .promise()
      .query(
        `DELETE p FROM payments p INNER JOIN invoices i ON i.id = p.invoice_id WHERE i.financial_contract_id = ?`,
        [contract.id]
      );
    await db
      .promise()
      .query(`UPDATE financial_contracts SET activation_invoice_id = NULL, enrollment_id = NULL WHERE id = ?`, [
        contract.id,
      ]);
    await db.promise().query(`DELETE FROM invoices WHERE financial_contract_id = ?`, [contract.id]);
  }

  const [enrollments] = await db.promise().query(`SELECT id FROM enrollments WHERE course_id = ?`, [targetCourseId]);

  for (const enrollment of enrollments) {
    await db.promise().query(`DELETE FROM financial_events WHERE enrollment_id = ?`, [enrollment.id]);
  }

  const studentIds = new Set();
  const [studentsFromContracts] = await db
    .promise()
    .query(`SELECT DISTINCT student_id FROM financial_contracts WHERE course_id = ?`, [targetCourseId]);
  studentsFromContracts.forEach((row) => studentIds.add(row.student_id));

  await db.promise().query(`DELETE FROM enrollments WHERE course_id = ?`, [targetCourseId]);
  await db.promise().query(`DELETE FROM financial_contracts WHERE course_id = ?`, [targetCourseId]);

  for (const studentId of studentIds) {
    const [studentRows] = await db.promise().query(`SELECT user_id FROM students WHERE id = ?`, [studentId]);
    if (studentRows.length === 0) continue;

    const userId = studentRows[0].user_id;

    await purgeUserAuxiliaryData(userId);
    await db.promise().query(`DELETE FROM student_contracting_parties WHERE student_id = ?`, [studentId]);
    await db.promise().query(`DELETE FROM contracting_parties WHERE user_id = ?`, [userId]);
    await db.promise().query(`DELETE FROM account_activation_tokens WHERE user_id = ?`, [userId]);
    await db.promise().query(`DELETE FROM students WHERE id = ?`, [studentId]);
    await db.promise().query(`DELETE FROM users WHERE id = ?`, [userId]);
  }

  await db.promise().query(`DELETE FROM course_pricing_plans WHERE course_id = ?`, [targetCourseId]);
  await db.promise().query(`DELETE FROM courses WHERE id = ?`, [targetCourseId]);
}

async function createTestContract(label, { amount = 500 } = {}) {
  const email = testEmail(label);

  const result = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: {
        name: `Aluno Teste Documentos ${label}`,
        email,
        birth_date: "2000-05-01",
        cpf: testCpf(Math.floor(Math.random() * 900) + 100),
        phone: "11999990000",
      },
      contractingPartyMode: "self",
      courseId,
      pricingPlanId: planId,
      billingData: { dueDate: "2026-12-01" },
    },
    adminUserId
  );

  const [studentRows] = await db.promise().query(`SELECT user_id FROM students WHERE id = ?`, [result.studentId]);

  return { ...result, userId: studentRows[0].user_id };
}

async function processAllQueuedDocuments() {
  for (let i = 0; i < 5; i += 1) {
    const { claimed } = await runCycle();
    if (claimed === 0) break;
  }
}

before(async () => {
  const [courseResult] = await db.promise().query(
    `
      INSERT INTO courses (teacher_id, name, description, workload_hours, price, status, nivel, created_at, updated_at)
      VALUES (NULL, ?, 'Curso de teste (documentos financeiros)', 10, 0, 'draft', 'Iniciante', NOW(), NOW())
    `,
    [COURSE_NAME]
  );
  courseId = courseResult.insertId;

  const [planResult] = await db.promise().query(
    `
      INSERT INTO course_pricing_plans
        (course_id, name, description, billing_type, total_amount, monthly_payment_count,
         monthly_payment_amount, max_card_installments, accepts_pix, accepts_boleto,
         accepts_credit_card, status, created_at, updated_at)
      VALUES (?, 'Plano de teste', NULL, 'one_time', 500.00, NULL, NULL, 1, 1, 1, 1, 'active', NOW(), NOW())
    `,
    [courseId]
  );
  planId = planResult.insertId;

  const [adminRows] = await db.promise().query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
  adminUserId = adminRows[0].id;
});

after(async () => {
  await retryOnDeadlock(() => purgeCourseData(courseId));
  await closeBrowser();
  await db.promise().end();
});

test("contrato: minuta antes da ativação, documento definitivo depois -- nunca duas linhas para o mesmo estágio", async () => {
  const { contractId, invoiceId, studentId } = await createTestContract("stage");
  const admin = { scope: "admin" };

  const draftDto = await requestContractDocument(db, { contractId, actorUserId: adminUserId, accessContext: admin });
  assert.equal(draftDto.status, "queued");

  const draftAgain = await requestContractDocument(db, {
    contractId,
    actorUserId: adminUserId,
    accessContext: admin,
  });
  assert.equal(draftAgain.id, draftDto.id, "pedir de novo enquanto ainda é minuta reaproveita a mesma linha");

  await processAllQueuedDocuments();

  const [draftRows] = await db
    .promise()
    .query(`SELECT snapshot_json FROM generated_documents WHERE id = ?`, [draftDto.id]);
  const draftSnapshot = parseSnapshot(draftRows[0].snapshot_json);
  assert.equal(draftSnapshot.contract.stage, "draft");

  await registerManualPayment(db, {
    invoiceId,
    amount: 500,
    paymentMethod: "pix",
    paymentDate: new Date().toISOString(),
    reason: "Teste automatizado",
    actorUserId: adminUserId,
  });

  const definitiveDto = await requestContractDocument(db, {
    contractId,
    actorUserId: adminUserId,
    accessContext: admin,
  });
  assert.notEqual(definitiveDto.id, draftDto.id, "ativação deve gerar um documento novo, não reescrever a minuta");

  await processAllQueuedDocuments();

  const [definitiveRows] = await db
    .promise()
    .query(`SELECT snapshot_json FROM generated_documents WHERE id = ?`, [definitiveDto.id]);
  const definitiveSnapshot = parseSnapshot(definitiveRows[0].snapshot_json);
  assert.equal(definitiveSnapshot.contract.stage, "definitive");

  // Alterações posteriores ao contrato não podem reescrever o
  // documento definitivo já emitido -- pedir de novo deve devolver a
  // MESMA linha, com o snapshot ANTIGO, mesmo que o plan_name real
  // tenha mudado depois.
  await db.promise().query(`UPDATE financial_contracts SET plan_name = 'Plano Renegociado Depois' WHERE id = ?`, [
    contractId,
  ]);

  const definitiveAgain = await requestContractDocument(db, {
    contractId,
    actorUserId: adminUserId,
    accessContext: admin,
  });
  assert.equal(definitiveAgain.id, definitiveDto.id);

  const [frozenRows] = await db
    .promise()
    .query(`SELECT snapshot_json FROM generated_documents WHERE id = ?`, [definitiveDto.id]);
  const frozenSnapshot = parseSnapshot(frozenRows[0].snapshot_json);
  assert.notEqual(frozenSnapshot.contract.planName, "Plano Renegociado Depois");

  void studentId;
});

test("segunda via de fatura: nunca cria fatura nova; muda de linha só quando o status real muda", async () => {
  const { contractId, invoiceId } = await createTestContract("invoice-copy");
  const admin = { scope: "admin" };

  const [invoicesBefore] = await db
    .promise()
    .query(`SELECT COUNT(*) AS total FROM invoices WHERE financial_contract_id = ?`, [contractId]);

  const openCopyDto = await requestInvoiceCopyDocument(db, {
    invoiceId,
    actorUserId: adminUserId,
    accessContext: admin,
  });
  await processAllQueuedDocuments();

  const [invoicesAfter] = await db
    .promise()
    .query(`SELECT COUNT(*) AS total FROM invoices WHERE financial_contract_id = ?`, [contractId]);
  assert.equal(Number(invoicesAfter[0].total), Number(invoicesBefore[0].total), "nunca cria uma invoice nova");

  const [openRows] = await db
    .promise()
    .query(`SELECT snapshot_json FROM generated_documents WHERE id = ?`, [openCopyDto.id]);
  assert.equal(parseSnapshot(openRows[0].snapshot_json).invoice.status, "pending");

  await registerManualPayment(db, {
    invoiceId,
    amount: 500,
    paymentMethod: "pix",
    paymentDate: new Date().toISOString(),
    reason: "Teste automatizado",
    actorUserId: adminUserId,
  });

  const paidCopyDto = await requestInvoiceCopyDocument(db, {
    invoiceId,
    actorUserId: adminUserId,
    accessContext: admin,
  });
  assert.notEqual(paidCopyDto.id, openCopyDto.id, "mudança real de status gera uma via nova e imutável");

  const paidCopyAgain = await requestInvoiceCopyDocument(db, {
    invoiceId,
    actorUserId: adminUserId,
    accessContext: admin,
  });
  assert.equal(paidCopyAgain.id, paidCopyDto.id, "sem mudança de status, reaproveita a mesma linha");
});

test("recibo: rejeita pagamento não confirmado; um recibo por pagamento; estorno não apaga o recibo original", async () => {
  const { invoiceId } = await createTestContract("receipt");
  const admin = { scope: "admin" };

  const [pendingPaymentResult] = await db.promise().query(
    `INSERT INTO payments (invoice_id, gateway, gateway_payment_id, source, payment_method, amount, status, created_at, updated_at)
     VALUES (?, 'simulated', ?, 'gateway', 'pix', 500.00, 'pending', NOW(), NOW())`,
    [invoiceId, `test-pending-${RUN_ID}`]
  );
  const pendingPaymentId = pendingPaymentResult.insertId;

  await assert.rejects(
    () => requestPaymentReceipt(db, { paymentId: pendingPaymentId, actorUserId: adminUserId, accessContext: admin }),
    (error) => {
      assert.equal(error.statusCode, 409);
      return true;
    }
  );

  const paymentResult = await registerManualPayment(db, {
    invoiceId,
    amount: 500,
    paymentMethod: "pix",
    paymentDate: new Date().toISOString(),
    reason: "Teste automatizado",
    actorUserId: adminUserId,
  });
  const approvedPaymentId = paymentResult.paymentId;

  const firstReceipt = await requestPaymentReceipt(db, {
    paymentId: approvedPaymentId,
    actorUserId: adminUserId,
    accessContext: admin,
  });
  await processAllQueuedDocuments();

  const secondReceipt = await requestPaymentReceipt(db, {
    paymentId: approvedPaymentId,
    actorUserId: adminUserId,
    accessContext: admin,
  });
  assert.equal(secondReceipt.id, firstReceipt.id, "no máximo um recibo por pagamento");

  // Simula um estorno (sem passar pelo fluxo completo de refund --
  // só a mudança de status relevante para este teste).
  await db.promise().query(`UPDATE payments SET status = 'refunded', refunded_at = NOW() WHERE id = ?`, [
    approvedPaymentId,
  ]);

  await assert.rejects(() =>
    requestPaymentReceipt(db, { paymentId: approvedPaymentId, actorUserId: adminUserId, accessContext: admin })
  );

  const [originalReceiptRows] = await db
    .promise()
    .query(`SELECT status FROM generated_documents WHERE id = ?`, [firstReceipt.id]);
  assert.equal(originalReceiptRows[0].status, "ready", "o recibo original continua íntegro após o estorno");
});

test("ownership do aluno: 404 genérico ao tentar acessar documento de contrato/fatura/pagamento de outro aluno", async () => {
  const owner = await createTestContract("owner");
  const intruder = await createTestContract("intruder");

  const intruderAccessContext = { scope: "student", studentId: intruder.studentId };

  await assert.rejects(
    () =>
      requestContractDocument(db, {
        contractId: owner.contractId,
        actorUserId: intruder.userId,
        accessContext: intruderAccessContext,
      }),
    (error) => {
      assert.equal(error.statusCode, 404);
      return true;
    }
  );

  await assert.rejects(
    () =>
      requestInvoiceCopyDocument(db, {
        invoiceId: owner.invoiceId,
        actorUserId: intruder.userId,
        accessContext: intruderAccessContext,
      }),
    (error) => {
      assert.equal(error.statusCode, 404);
      return true;
    }
  );

  // O dono de verdade consegue normalmente, provando que o 404 acima
  // é mesmo sobre ownership e não um erro genérico de configuração.
  const ownerAccessContext = { scope: "student", studentId: owner.studentId };
  const ownedDto = await requestContractDocument(db, {
    contractId: owner.contractId,
    actorUserId: owner.userId,
    accessContext: ownerAccessContext,
  });
  assert.ok(ownedDto.id);

  const statusAsOwner = await getContractDocumentStatus(db, {
    contractId: owner.contractId,
    accessContext: ownerAccessContext,
  });
  assert.equal(statusAsOwner.id, ownedDto.id);
});
