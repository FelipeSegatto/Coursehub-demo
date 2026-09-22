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
const { createRuleVersion } = require("../../services/academic/completionRuleService");

const {
  requestEnrollmentDeclaration,
  getEnrollmentDeclarationStatus,
} = require("../../services/academic/enrollmentDeclarationService");
const { revokeDeclaration } = require("../../services/academic/academicDeclarationEngine");
const {
  issueCertificate,
  revokeCertificate,
  reissueCertificate,
} = require("../../services/academic/certificateService");
const { verifyByCode } = require("../../services/academic/documentVerificationService");

const { runCycle } = require("../../workers/documentGenerationWorker");
const { deleteDocument } = require("../../services/documents/documentStorageService");
const { closeBrowser } = require("../../services/documents/documentRendererService");

const COURSE_NAME = "TEST ACADEMIC DOCUMENTS COURSE";
const RUN_ID = Date.now();

let courseId;
let planId;
let adminUserId;
let enrollmentId;
let studentId;
let studentUserId;

function testCpf(sequence) {
  const digits = String(RUN_ID).slice(-6) + String(sequence).padStart(3, "0");

  return digits.slice(0, 9).padEnd(9, "0") + "00";
}

async function processAllQueuedDocuments() {
  for (let i = 0; i < 5; i += 1) {
    const { claimed } = await runCycle();
    if (claimed === 0) break;
  }
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

async function purgeCourseData() {
  const [genDocs] = await db
    .promise()
    .query(`SELECT storage_key FROM generated_documents WHERE subject_type = 'enrollment' AND subject_id = ?`, [
      enrollmentId,
    ]);

  for (const doc of genDocs) {
    if (doc.storage_key) await deleteDocument(doc.storage_key).catch(() => {});
  }

  await db.promise().query(`DELETE FROM certificates WHERE enrollment_id = ?`, [enrollmentId]);
  await db.promise().query(`DELETE FROM declarations WHERE enrollment_id = ?`, [enrollmentId]);
  await db
    .promise()
    .query(`DELETE FROM generated_documents WHERE subject_type = 'enrollment' AND subject_id = ?`, [enrollmentId]);
  await db.promise().query(`DELETE FROM completion_rules WHERE course_id = ?`, [courseId]);

  const [contracts] = await db.promise().query(`SELECT id FROM financial_contracts WHERE course_id = ?`, [
    courseId,
  ]);

  for (const contract of contracts) {
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

  // Alguns financial_events (ex: account_activation_invitation_created)
  // são escritos só com enrollment_id, sem financial_contract_id --
  // o loop acima nunca alcança essas linhas.
  await db.promise().query(`DELETE FROM financial_events WHERE enrollment_id = ?`, [enrollmentId]);

  await db.promise().query(`DELETE FROM enrollments WHERE course_id = ?`, [courseId]);
  await db.promise().query(`DELETE FROM financial_contracts WHERE course_id = ?`, [courseId]);

  if (studentId) {
    await purgeUserAuxiliaryData(studentUserId);
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
    `
      INSERT INTO courses (teacher_id, name, description, workload_hours, price, status, nivel, created_at, updated_at)
      VALUES (NULL, ?, 'Curso de teste (documentos acadêmicos)', 20, 0, 'draft', 'Iniciante', NOW(), NOW())
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
      VALUES (?, 'Plano de teste', NULL, 'one_time', 400.00, NULL, NULL, 1, 1, 1, 1, 'active', NOW(), NOW())
    `,
    [courseId]
  );
  planId = planResult.insertId;

  const [adminRows] = await db.promise().query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
  adminUserId = adminRows[0].id;

  const email = `academic.documents.${RUN_ID}@example.com`;
  const result = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: {
        name: "Aluno Teste Documentos Academicos",
        email,
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

  studentId = result.studentId;

  const paymentResult = await registerManualPayment(db, {
    invoiceId: result.invoiceId,
    amount: 400,
    paymentMethod: "pix",
    paymentDate: new Date().toISOString(),
    reason: "Teste automatizado",
    actorUserId: adminUserId,
  });

  enrollmentId = paymentResult.activationResult.enrollmentId;

  const [studentRows] = await db.promise().query(`SELECT user_id FROM students WHERE id = ?`, [studentId]);
  studentUserId = studentRows[0].user_id;

  await createRuleVersion(db, {
    courseId,
    minContentProgressPercentage: 0,
    requireAllMandatoryItems: false,
    createdByUserId: adminUserId,
  });
});

after(async () => {
  await retryOnDeadlock(() => purgeCourseData());
  await closeBrowser();
  await db.promise().end();
});

const adminAccessContext = { scope: "admin" };

test("declaração de matrícula: idempotente enquanto o status não muda, ownership 404 para outro aluno, revogação preserva histórico", async () => {
  const first = await requestEnrollmentDeclaration(db, {
    enrollmentId,
    actorUserId: adminUserId,
    accessContext: adminAccessContext,
  });
  await processAllQueuedDocuments();

  const second = await requestEnrollmentDeclaration(db, {
    enrollmentId,
    actorUserId: adminUserId,
    accessContext: adminAccessContext,
  });
  assert.equal(second.id, first.id, "sem mudança de status, reaproveita a mesma declaração");

  await assert.rejects(
    () =>
      getEnrollmentDeclarationStatus(db, {
        enrollmentId,
        accessContext: { scope: "student", studentId: 999999 },
      }),
    (error) => {
      assert.equal(error.statusCode, 404);
      return true;
    }
  );

  await revokeDeclaration(db, { declarationId: Number(first.id), actorUserId: adminUserId, reason: "teste" });

  const [rows] = await db.promise().query(`SELECT status FROM declarations WHERE id = ?`, [first.id]);
  assert.equal(rows[0].status, "revoked");

  await assert.rejects(() =>
    revokeDeclaration(db, { declarationId: Number(first.id), actorUserId: adminUserId, reason: "duplo" })
  );
});

test("certificado: rejeita quando inelegível com motivo, um ativo por matrícula, revogação + reemissão com código novo, verificação pública reflete o estado", async () => {
  // Regra deliberadamente inatingível (progresso 100% num curso sem
  // nenhum conteúdo/progresso real) para provar o caminho de rejeição
  // antes de testar a emissão bem-sucedida.
  await createRuleVersion(db, {
    courseId,
    minContentProgressPercentage: 100,
    requireAllMandatoryItems: false,
    createdByUserId: adminUserId,
  });

  await assert.rejects(
    () => issueCertificate(db, { enrollmentId, actorUserId: adminUserId }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /não elegível/);
      return true;
    }
  );

  await createRuleVersion(db, {
    courseId,
    minContentProgressPercentage: 0,
    requireAllMandatoryItems: false,
    createdByUserId: adminUserId,
  });

  const firstCertificate = await issueCertificate(db, { enrollmentId, actorUserId: adminUserId });
  await processAllQueuedDocuments();

  const secondCertificate = await issueCertificate(db, { enrollmentId, actorUserId: adminUserId });
  assert.equal(secondCertificate.id, firstCertificate.id, "no máximo um certificado ativo por matrícula");

  const beforeRevoke = await verifyByCode(db, firstCertificate.verificationCode);
  assert.equal(beforeRevoke.status, "valid");
  assert.equal(beforeRevoke.documentType, "certificate");
  assert.equal(Object.prototype.hasOwnProperty.call(beforeRevoke, "cpf"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(beforeRevoke, "email"), false);

  await revokeCertificate(db, {
    certificateId: Number(firstCertificate.id),
    actorUserId: adminUserId,
    reason: "teste",
  });

  const afterRevoke = await verifyByCode(db, firstCertificate.verificationCode);
  assert.equal(afterRevoke.status, "revoked");

  const reissued = await reissueCertificate(db, { certificateId: Number(firstCertificate.id), actorUserId: adminUserId });
  assert.notEqual(reissued.id, firstCertificate.id);
  assert.notEqual(reissued.verificationCode, firstCertificate.verificationCode);

  const notFound = await verifyByCode(db, "CODIGOINEXISTENTE0");
  assert.equal(notFound.status, "not_found");
});
