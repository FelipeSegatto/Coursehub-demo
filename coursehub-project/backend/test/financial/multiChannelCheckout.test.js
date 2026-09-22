const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();
require("../../services/notifications/eventDefinitions");

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");

const {
  createStudentContractWithInitialInvoice,
} = require("../../services/financial/contractCreationService");
const {
  resolveOrCreateCheckoutStudent,
  assertContractingPartyAllowedForAge,
} = require("../../services/financial/publicCheckoutIdentityService");
const {
  startPublicCheckoutSession,
  verifyCheckoutEmail,
} = require("../../services/financial/publicCheckoutSessionService");
const { submitPublicCheckoutContract } = require("../../services/financial/publicCheckoutService");
const {
  purchaseAdditionalCourseAsAuthenticatedStudent,
} = require("../../services/financial/authenticatedCheckoutService");
const { registerManualPayment } = require("../../services/financial/paymentService");
const { createEnrollment } = require("../../services/admin/adminEnrollmentService");
const { createStudent } = require("../../services/admin/adminStudentService");
const {
  createAccessToken,
  findValidAccessToken,
} = require("../../repositories/invoicePaymentAccessTokens");
const simulatedGateway = require("../../services/paymentGateway/simulatedGateway");
const { withTransaction } = require("../../utils/dbTransaction");
const { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } = require("../../config/legalVersions");

const COURSE_NAME = "TEST MULTI-CHANNEL CHECKOUT COURSE";
const RUN_ID = Date.now();

let courseId;
let planId;
let adminUserId;

function testCpf(sequence) {
  const digits = String(RUN_ID).slice(-6) + String(sequence).padStart(3, "0");

  return digits.slice(0, 9).padEnd(9, "0") + "00";
}

function testEmail(label) {
  return `multichannel.${RUN_ID}.${label}@example.com`;
}

async function purgeCourseData(targetCourseId) {
  const [contracts] = await db
    .promise()
    .query(`SELECT id FROM financial_contracts WHERE course_id = ?`, [targetCourseId]);

  for (const contract of contracts) {
    const [invoices] = await db
      .promise()
      .query(`SELECT id FROM invoices WHERE financial_contract_id = ?`, [contract.id]);

    for (const invoice of invoices) {
      // invoice_payment_access_tokens tem ON DELETE RESTRICT em
      // invoice_id -- precisa ser removido (e as sessoes que dependem
      // dele, via CASCADE) ANTES da propria invoice, ou o DELETE de
      // invoices falha com violacao de FK.
      await db
        .promise()
        .query(`DELETE FROM invoice_payment_access_tokens WHERE invoice_id = ?`, [invoice.id]);
    }

    await db.promise().query(`DELETE FROM financial_events WHERE financial_contract_id = ?`, [
      contract.id,
    ]);

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

  // financial_events pode ter linhas ancoradas SÓ em enrollment_id
  // (financial_contract_id NULL) -- ex.: account_activation_invitation_created,
  // disparado por dispatchActivationNotifications/
  // dispatchEnrollmentActivationIfNeeded sempre que a matrícula ativada
  // pertence a um aluno pending_activation. O loop por contrato acima só
  // limpa financial_events pelo financial_contract_id, então isso
  // precisa de uma passada própria antes de apagar as enrollments, ou o
  // DELETE abaixo falha com FK.
  await db.promise().query(
    `DELETE FROM financial_events WHERE enrollment_id IN (SELECT id FROM enrollments WHERE course_id = ?)`,
    [targetCourseId]
  );

  await db.promise().query(`DELETE FROM enrollments WHERE course_id = ?`, [targetCourseId]);

  const studentIds = new Set();

  const [studentsFromContracts] = await db
    .promise()
    .query(`SELECT DISTINCT student_id FROM financial_contracts WHERE course_id = ?`, [targetCourseId]);

  studentsFromContracts.forEach((row) => studentIds.add(row.student_id));

  await db.promise().query(`DELETE FROM financial_contracts WHERE course_id = ?`, [targetCourseId]);

  for (const studentId of studentIds) {
    const [studentRows] = await db.promise().query(`SELECT user_id FROM students WHERE id = ?`, [
      studentId,
    ]);

    if (studentRows.length === 0) continue;

    const userId = studentRows[0].user_id;

    await purgeUserAuxiliaryData(userId);

    await db.promise().query(`DELETE FROM student_contracting_parties WHERE student_id = ?`, [studentId]);
    await db.promise().query(`DELETE FROM contracting_parties WHERE user_id = ?`, [userId]);
    await db.promise().query(`DELETE FROM account_activation_tokens WHERE user_id = ?`, [userId]);
    await db.promise().query(`DELETE FROM students WHERE id = ?`, [studentId]);
    await db.promise().query(`DELETE FROM users WHERE id = ?`, [userId]);
  }

  await db.promise().query(`DELETE FROM public_checkout_sessions WHERE course_id = ?`, [targetCourseId]);
  await db.promise().query(`DELETE FROM course_pricing_plans WHERE course_id = ?`, [targetCourseId]);
  await db.promise().query(`DELETE FROM courses WHERE id = ?`, [targetCourseId]);
}

async function purgeUserAuxiliaryData(userId) {
  const [notifs] = await db.promise().query(`SELECT id FROM notifications WHERE actor_user_id = ?`, [
    userId,
  ]);

  for (const notification of notifs) {
    await db
      .promise()
      .query(
        `DELETE nd FROM notification_deliveries nd INNER JOIN notification_recipients nr ON nr.id = nd.recipient_id WHERE nr.notification_id = ?`,
        [notification.id]
      );
    await db.promise().query(`DELETE FROM notification_recipients WHERE notification_id = ?`, [
      notification.id,
    ]);
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

async function cleanupStaleFixtures() {
  const [staleCourses] = await db.promise().query(`SELECT id FROM courses WHERE name = ?`, [COURSE_NAME]);

  for (const course of staleCourses) {
    await purgeCourseData(course.id);
  }
}

before(async () => {
  await cleanupStaleFixtures();

  const [adminRows] = await db.promise().query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
  adminUserId = adminRows[0].id;

  const [courseResult] = await db.promise().query(
    `
      INSERT INTO courses (teacher_id, name, description, workload_hours, price, status, nivel, created_at, updated_at)
      VALUES (NULL, ?, 'Curso de teste (checkout multi-canal)', 10, 0, 'draft', 'Iniciante', NOW(), NOW())
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
      VALUES (?, 'Plano de teste', NULL, 'one_time', 300.00, NULL, NULL, 1, 1, 1, 1, 'active', NOW(), NOW())
    `,
    [courseId]
  );

  planId = planResult.insertId;
});

// admin.checkout.completed/admin.enrollment.created recipients are
// always real admins (resolveAllActiveAdmins), never the test
// student, and actor_user_id is always NULL for these dispatches --
// purgeCourseData's per-student notification cleanup never finds
// them, so they're tracked and removed separately here.
const createdEnrollmentNotificationIds = [];

async function cleanupEnrollmentNotification(notificationId) {
  if (!notificationId) return;

  await retryOnDeadlock(() =>
    db
      .promise()
      .query(
        `DELETE FROM notification_deliveries WHERE recipient_id IN (SELECT id FROM notification_recipients WHERE notification_id = ?)`,
        [notificationId]
      )
  );
  await retryOnDeadlock(() =>
    db.promise().query(`DELETE FROM notification_recipients WHERE notification_id = ?`, [notificationId])
  );
  await retryOnDeadlock(() => db.promise().query(`DELETE FROM notifications WHERE id = ?`, [notificationId]));
}

async function findEnrollmentNotification(enrollmentId, type) {
  const [rows] = await db
    .promise()
    .query(
      `SELECT id, category, deduplication_key FROM notifications WHERE source_type = 'enrollment' AND source_id = ? AND type = ? LIMIT 1`,
      [enrollmentId, type]
    );

  return rows[0] || null;
}

after(async () => {
  for (const notificationId of createdEnrollmentNotificationIds) {
    await cleanupEnrollmentNotification(notificationId);
  }

  await retryOnDeadlock(() => purgeCourseData(courseId));
  await db.promise().end();
});

// -----------------------------------------------------------------
// Identidade e prevenção de duplicidade
// -----------------------------------------------------------------

test("resolveOrCreateCheckoutStudent: CPF de aluno existente é rejeitado com erro genérico, sem revelar o motivo", async () => {
  const email = testEmail("cpf-owner");
  const cpf = testCpf(1);

  const created = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: { name: "Dono do CPF", email, birth_date: "1990-01-01", cpf, phone: "11900000001" },
      contractingPartyMode: "self",
      courseId,
      pricingPlanId: planId,
      billingData: { dueDate: "2026-12-01" },
    },
    adminUserId
  );

  assert.ok(created.studentId);

  await assert.rejects(
    () =>
      withTransaction(db, (connection) =>
        resolveOrCreateCheckoutStudent(db, connection, {
          name: "Outra Pessoa",
          email: testEmail("attempt-with-existing-cpf"),
          birthDate: "1995-01-01",
          cpf,
          phone: "11900000002",
        })
      ),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /não foi possível concluir o cadastro/i);
      assert.doesNotMatch(error.message, /cpf/i);
      return true;
    }
  );
});

test("resolveOrCreateCheckoutStudent: e-mail de conta existente é rejeitado com o MESMO erro genérico (sem distinguir de CPF)", async () => {
  const email = testEmail("email-owner");

  const created = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: { name: "Dono do E-mail", email, birth_date: "1990-01-01", cpf: testCpf(2), phone: "11900000003" },
      contractingPartyMode: "self",
      courseId,
      pricingPlanId: planId,
      billingData: { dueDate: "2026-12-01" },
    },
    adminUserId
  );

  assert.ok(created.studentId);

  await assert.rejects(
    () =>
      withTransaction(db, (connection) =>
        resolveOrCreateCheckoutStudent(db, connection, {
          name: "Outra Pessoa",
          email,
          birthDate: "1995-01-01",
          cpf: testCpf(3),
          phone: "11900000004",
        })
      ),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /não foi possível concluir o cadastro/i);
      return true;
    }
  );

  // Nenhum usuário/aluno novo foi criado pela tentativa rejeitada.
  const [countRows] = await db.promise().query(`SELECT COUNT(*) AS total FROM users WHERE email = ?`, [email]);
  assert.equal(Number(countRows[0].total), 1);
});

test("resolveOrCreateCheckoutStudent: dados novos e únicos criam um aluno pending_activation normalmente", async () => {
  const email = testEmail("brand-new");

  const result = await withTransaction(db, (connection) =>
    resolveOrCreateCheckoutStudent(db, connection, {
      name: "Aluno Novo Checkout",
      email,
      birthDate: "1998-03-10",
      cpf: testCpf(4),
      phone: "11900000005",
    })
  );

  assert.ok(result.studentId);
  assert.equal(result.isNewStudent, true);

  await db.promise().query(`DELETE FROM students WHERE id = ?`, [result.studentId]);
  await db.promise().query(`DELETE FROM users WHERE email = ?`, [email]);
});

test("assertContractingPartyAllowedForAge: bloqueia self para menor, permite contratante terceiro", () => {
  const minorBirthDate = new Date();
  minorBirthDate.setFullYear(minorBirthDate.getFullYear() - 10);
  const minorBirthDateStr = minorBirthDate.toISOString().slice(0, 10);

  assert.throws(
    () => assertContractingPartyAllowedForAge(minorBirthDateStr, "self"),
    /menores de/i
  );

  assert.doesNotThrow(() => assertContractingPartyAllowedForAge(minorBirthDateStr, "new"));

  const adultBirthDate = new Date();
  adultBirthDate.setFullYear(adultBirthDate.getFullYear() - 30);
  const adultBirthDateStr = adultBirthDate.toISOString().slice(0, 10);

  assert.doesNotThrow(() => assertContractingPartyAllowedForAge(adultBirthDateStr, "self"));
});

// -----------------------------------------------------------------
// Fluxo completo de checkout público
// -----------------------------------------------------------------

test("checkout público: sessão -> verificação de e-mail -> submissão cria contrato+invoice+aceite, converte a sessão uma única vez", async () => {
  const email = testEmail("public-flow");

  const sessionResult = await startPublicCheckoutSession(db, { courseId, pricingPlanId: planId, email });
  assert.ok(sessionResult.checkoutToken);

  const [sessionRows] = await db
    .promise()
    .query(`SELECT id, email_verification_token_hash, status FROM public_checkout_sessions WHERE session_token_hash = SHA2(?, 256)`, [
      sessionResult.checkoutToken,
    ]);

  assert.equal(sessionRows[0].status, "pending_verification");

  // O token de verificação nunca é devolvido pela API pública -- para
  // o teste, lemos a notificação criada para pegar o link exatamente
  // como o e-mail teria (via actionPath), não inventando um caminho
  // próprio de acesso ao token bruto.
  const [notificationRows] = await db.promise().query(
    `
      SELECT nr.action_path
      FROM notification_recipients nr
      INNER JOIN notifications n ON n.id = nr.notification_id
      WHERE n.type = 'checkout.email_verification_requested' AND nr.external_email = ?
      ORDER BY nr.id DESC LIMIT 1
    `,
    [email]
  );

  assert.ok(notificationRows[0], "deveria ter agendado a notificação de verificação de e-mail");

  const verificationToken = new URL(`https://x${notificationRows[0].action_path}`).searchParams.get("token");
  assert.ok(verificationToken);

  const verifyResult = await verifyCheckoutEmail(db, verificationToken);
  assert.match(verifyResult.message, /confirmado/i);

  const submitResult = await submitPublicCheckoutContract(db, {
    checkoutToken: sessionResult.checkoutToken,
    recipientMode: "self",
    studentCandidate: {
      name: "Aluno Checkout Público",
      email,
      birthDate: "1992-07-15",
      cpf: testCpf(5),
      phone: "11900000006",
    },
    acceptance: { termsVersion: CURRENT_TERMS_VERSION, privacyVersion: CURRENT_PRIVACY_VERSION },
    paymentMethod: "pix",
    ipAddress: "127.0.0.1",
    userAgent: "node:test",
  });

  assert.ok(submitResult.contractId);
  assert.ok(submitResult.invoiceId);

  const [contractRows] = await db
    .promise()
    .query(`SELECT origin, status FROM financial_contracts WHERE id = ?`, [submitResult.contractId]);

  assert.equal(contractRows[0].origin, "public_checkout");
  assert.equal(contractRows[0].status, "pending_payment");

  const [acceptanceRows] = await db
    .promise()
    .query(`SELECT acceptance_method, terms_version FROM contract_acceptances WHERE financial_contract_id = ?`, [
      submitResult.contractId,
    ]);

  assert.equal(acceptanceRows.length, 1);
  assert.equal(acceptanceRows[0].acceptance_method, "public_checkout");
  assert.equal(acceptanceRows[0].terms_version, CURRENT_TERMS_VERSION);

  const [convertedSessionRows] = await db
    .promise()
    .query(`SELECT status, financial_contract_id FROM public_checkout_sessions WHERE id = ?`, [
      sessionRows[0].id,
    ]);

  assert.equal(convertedSessionRows[0].status, "converted");
  assert.equal(convertedSessionRows[0].financial_contract_id, submitResult.contractId);

  // Resubmeter a mesma sessão (já convertida) nunca cria um segundo contrato.
  await assert.rejects(
    () =>
      submitPublicCheckoutContract(db, {
        checkoutToken: sessionResult.checkoutToken,
        recipientMode: "self",
        studentCandidate: {
          name: "Aluno Checkout Público",
          email,
          birthDate: "1992-07-15",
          cpf: testCpf(5),
          phone: "11900000006",
        },
        acceptance: { termsVersion: CURRENT_TERMS_VERSION, privacyVersion: CURRENT_PRIVACY_VERSION },
        paymentMethod: "pix",
      }),
    /já foi concluída/i
  );

  const [contractCountRows] = await db
    .promise()
    .query(`SELECT COUNT(*) AS total FROM financial_contracts WHERE course_id = ? AND origin = 'public_checkout'`, [
      courseId,
    ]);

  assert.equal(Number(contractCountRows[0].total), 1);
});

test("checkout público: versão de termos desatualizada é rejeitada, contrato criado pelo admin não gera linha de aceite", async () => {
  const email = testEmail("stale-version");

  const sessionResult = await startPublicCheckoutSession(db, { courseId, pricingPlanId: planId, email });

  const [notificationRows] = await db.promise().query(
    `
      SELECT nr.action_path
      FROM notification_recipients nr
      INNER JOIN notifications n ON n.id = nr.notification_id
      WHERE n.type = 'checkout.email_verification_requested' AND nr.external_email = ?
      ORDER BY nr.id DESC LIMIT 1
    `,
    [email]
  );

  const verificationToken = new URL(`https://x${notificationRows[0].action_path}`).searchParams.get("token");
  await verifyCheckoutEmail(db, verificationToken);

  await assert.rejects(
    () =>
      submitPublicCheckoutContract(db, {
        checkoutToken: sessionResult.checkoutToken,
        recipientMode: "self",
        studentCandidate: {
          name: "Aluno Versao Antiga",
          email,
          birthDate: "1992-07-15",
          cpf: testCpf(6),
          phone: "11900000007",
        },
        acceptance: { termsVersion: "0.0.1-old", privacyVersion: "0.0.1-old" },
        paymentMethod: "pix",
      }),
    /atualizados/i
  );

  // Contrato administrativo (sem bloco acceptance) nunca gera linha em contract_acceptances.
  const adminCreated = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: {
        name: "Aluno Admin Sem Aceite",
        email: testEmail("admin-no-acceptance"),
        birth_date: "1990-01-01",
        cpf: testCpf(7),
        phone: "11900000008",
      },
      contractingPartyMode: "self",
      courseId,
      pricingPlanId: planId,
      billingData: { dueDate: "2026-12-01" },
    },
    adminUserId
  );

  const [adminAcceptanceRows] = await db
    .promise()
    .query(`SELECT COUNT(*) AS total FROM contract_acceptances WHERE financial_contract_id = ?`, [
      adminCreated.contractId,
    ]);

  assert.equal(Number(adminAcceptanceRows[0].total), 0);
});

// -----------------------------------------------------------------
// Checkout autenticado -- reuso diferenciado por status do contrato
// -----------------------------------------------------------------

test("checkout autenticado: contrato pending_payment é retomado (mesma invoice, nenhum contrato novo)", async () => {
  const email = testEmail("resume-pending");

  const created = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: { name: "Aluno Retomada", email, birth_date: "1990-01-01", cpf: testCpf(8), phone: "11900000009" },
      contractingPartyMode: "self",
      courseId,
      pricingPlanId: planId,
      billingData: { dueDate: "2026-12-01" },
    },
    adminUserId
  );

  const [studentRows] = await db.promise().query(`SELECT user_id FROM students WHERE id = ?`, [
    created.studentId,
  ]);
  const userId = studentRows[0].user_id;

  const result = await purchaseAdditionalCourseAsAuthenticatedStudent(db, {
    userId,
    courseId,
    pricingPlanId: planId,
    paymentMethod: "pix",
  });

  assert.equal(result.contractId, created.contractId);
  assert.equal(result.invoiceId, created.invoiceId);

  const [contractCountRows] = await db
    .promise()
    .query(`SELECT COUNT(*) AS total FROM financial_contracts WHERE student_id = ? AND course_id = ?`, [
      created.studentId,
      courseId,
    ]);

  assert.equal(Number(contractCountRows[0].total), 1);
});

test("checkout autenticado: contrato active bloqueia nova tentativa ('você já possui este curso')", async () => {
  const email = testEmail("already-active");

  const created = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: { name: "Aluno Ja Ativo", email, birth_date: "1990-01-01", cpf: testCpf(9), phone: "11900000010" },
      contractingPartyMode: "self",
      courseId,
      pricingPlanId: planId,
      billingData: { dueDate: "2026-12-01" },
    },
    adminUserId
  );

  await db.promise().query(`UPDATE financial_contracts SET status = 'active' WHERE id = ?`, [created.contractId]);

  const [studentRows] = await db.promise().query(`SELECT user_id FROM students WHERE id = ?`, [
    created.studentId,
  ]);

  await assert.rejects(
    () =>
      purchaseAdditionalCourseAsAuthenticatedStudent(db, {
        userId: studentRows[0].user_id,
        courseId,
        pricingPlanId: planId,
        paymentMethod: "pix",
      }),
    /já possui este curso/i
  );

  // Nenhuma tentativa de pagamento nova foi criada para o contrato já ativo.
  const [paymentCountRows] = await db.promise().query(
    `SELECT COUNT(*) AS total FROM payments p INNER JOIN invoices i ON i.id = p.invoice_id WHERE i.financial_contract_id = ?`,
    [created.contractId]
  );

  assert.equal(Number(paymentCountRows[0].total), 0);
});

test("checkout autenticado: contrato cancelled permite nova contratação normalmente", async () => {
  const email = testEmail("cancelled-then-new");

  const created = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: { name: "Aluno Cancelado", email, birth_date: "1990-01-01", cpf: testCpf(10), phone: "11900000011" },
      contractingPartyMode: "self",
      courseId,
      pricingPlanId: planId,
      billingData: { dueDate: "2026-12-01" },
    },
    adminUserId
  );

  await db.promise().query(`UPDATE financial_contracts SET status = 'cancelled' WHERE id = ?`, [created.contractId]);

  const [studentRows] = await db.promise().query(`SELECT user_id FROM students WHERE id = ?`, [
    created.studentId,
  ]);

  const result = await purchaseAdditionalCourseAsAuthenticatedStudent(db, {
    userId: studentRows[0].user_id,
    courseId,
    pricingPlanId: planId,
    paymentMethod: "pix",
  });

  assert.notEqual(result.contractId, created.contractId);

  const [statusRows] = await db
    .promise()
    .query(`SELECT status, origin FROM financial_contracts WHERE id = ?`, [result.contractId]);

  assert.equal(statusRows[0].status, "pending_payment");
  assert.equal(statusRows[0].origin, "authenticated_checkout");
});

// -----------------------------------------------------------------
// Token de pagamento privado de invoice
// -----------------------------------------------------------------

test("invoicePaymentAccessTokens: emitir um novo token invalida o anterior da mesma invoice", async () => {
  const created = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: {
        name: "Aluno Token Invoice",
        email: testEmail("token-invoice"),
        birth_date: "1990-01-01",
        cpf: testCpf(11),
        phone: "11900000012",
      },
      contractingPartyMode: "self",
      courseId,
      pricingPlanId: planId,
      billingData: { dueDate: "2026-12-01" },
    },
    adminUserId
  );

  const first = await createAccessToken(db.promise(), {
    invoiceId: created.invoiceId,
    recipientName: "Aluno Token Invoice",
    recipientEmail: "token-invoice@example.com",
  });

  const firstStillValid = await findValidAccessToken(db.promise(), first.rawToken);
  assert.ok(firstStillValid);

  const second = await createAccessToken(db.promise(), {
    invoiceId: created.invoiceId,
    recipientName: "Aluno Token Invoice",
    recipientEmail: "token-invoice@example.com",
  });

  const firstAfterSecond = await findValidAccessToken(db.promise(), first.rawToken);
  assert.equal(firstAfterSecond, null);

  const secondStillValid = await findValidAccessToken(db.promise(), second.rawToken);
  assert.ok(secondStillValid);

  const unknownToken = await findValidAccessToken(db.promise(), "token-que-nunca-existiu");
  assert.equal(unknownToken, null);
});

// -----------------------------------------------------------------
// Gateway simulado -- boleto e cartão
// -----------------------------------------------------------------

test("simulatedGateway: boleto fica pending até simulateApproval, cartão aprova/recusa de forma determinística", async () => {
  const boleto = await simulatedGateway.createPayment({
    paymentId: 999001,
    invoiceId: 999001,
    paymentMethod: "boleto",
    amount: 100,
    externalReference: "invoice:999001:payment:999001",
    idempotencyKey: `test-boleto-${RUN_ID}`,
  });

  assert.equal(boleto.status, "pending");
  assert.ok(boleto.boletoBarcode);
  assert.ok(boleto.boletoDueDate);

  const approvedBoleto = simulatedGateway.simulateApproval(boleto.gatewayPaymentId);
  assert.equal(approvedBoleto.status, "approved");

  const approvedCard = await simulatedGateway.createPayment({
    paymentId: 999002,
    invoiceId: 999002,
    paymentMethod: "credit_card",
    amount: 100,
    cardToken: "sim_card_ok",
    cardInstallments: 1,
    externalReference: "invoice:999002:payment:999002",
    idempotencyKey: `test-card-ok-${RUN_ID}`,
  });

  assert.equal(approvedCard.status, "approved");

  const declinedCard = await simulatedGateway.createPayment({
    paymentId: 999003,
    invoiceId: 999003,
    paymentMethod: "credit_card",
    amount: 100,
    cardToken: simulatedGateway.SIMULATED_DECLINED_CARD_TOKEN,
    cardInstallments: 1,
    externalReference: "invoice:999003:payment:999003",
    idempotencyKey: `test-card-declined-${RUN_ID}`,
  });

  assert.equal(declinedCard.status, "rejected");
});

// -----------------------------------------------------------------
// admin.checkout.completed / admin.enrollment.created (evolução do
// sistema de notificações, seção 5/20.B/20.C) -- ramificam por
// financial_contracts.origin no único ponto de convergência
// (activateContractFromPaidInvoice), nunca os dois para a mesma
// enrollment.
// -----------------------------------------------------------------

test("origin=public_checkout: pagamento aprovado gera admin.checkout.completed (category=enrollment), nunca admin.enrollment.created", async () => {
  const result = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: {
        name: "Aluno Teste Notif Checkout",
        email: testEmail("notif-checkout"),
        birth_date: "2000-05-01",
        cpf: testCpf(50),
        phone: "11999990050",
      },
      contractingPartyMode: "self",
      courseId,
      pricingPlanId: planId,
      billingData: { dueDate: "2026-12-01" },
      origin: "public_checkout",
    },
    adminUserId
  );

  const paymentResult = await registerManualPayment(db, {
    invoiceId: result.invoiceId,
    amount: 300,
    paymentMethod: "pix",
    paymentDate: new Date().toISOString(),
    reason: "Teste automatizado (notificação de checkout)",
    actorUserId: adminUserId,
  });

  const enrollmentId = paymentResult.activationResult.enrollmentId;
  assert.ok(enrollmentId);

  const checkoutNotification = await findEnrollmentNotification(enrollmentId, "admin.checkout.completed");
  assert.ok(checkoutNotification, "admin.checkout.completed deveria ter sido criada");
  createdEnrollmentNotificationIds.push(checkoutNotification.id);

  assert.equal(checkoutNotification.category, "enrollment");
  assert.equal(checkoutNotification.deduplication_key, `admin:checkout-completed:${enrollmentId}`);

  const enrollmentNotification = await findEnrollmentNotification(enrollmentId, "admin.enrollment.created");
  assert.equal(enrollmentNotification, null, "admin.enrollment.created não deveria disparar para um checkout");
});

test("origin=admin (pagamento externo registrado): gera admin.enrollment.created, nunca admin.checkout.completed", async () => {
  const result = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: {
        name: "Aluno Teste Notif Enrollment Admin",
        email: testEmail("notif-enrollment-admin"),
        birth_date: "2000-05-01",
        cpf: testCpf(51),
        phone: "11999990051",
      },
      contractingPartyMode: "self",
      courseId,
      pricingPlanId: planId,
      billingData: { dueDate: "2026-12-01" },
      // origin omitido -- default é 'admin' (ver contractCreationService.js)
    },
    adminUserId
  );

  const paymentResult = await registerManualPayment(db, {
    invoiceId: result.invoiceId,
    amount: 300,
    paymentMethod: "pix",
    paymentDate: new Date().toISOString(),
    reason: "Teste automatizado (notificação de matrícula admin)",
    actorUserId: adminUserId,
  });

  const enrollmentId = paymentResult.activationResult.enrollmentId;
  assert.ok(enrollmentId);

  const enrollmentNotification = await findEnrollmentNotification(enrollmentId, "admin.enrollment.created");
  assert.ok(enrollmentNotification, "admin.enrollment.created deveria ter sido criada");
  createdEnrollmentNotificationIds.push(enrollmentNotification.id);

  assert.equal(enrollmentNotification.category, "enrollment");
  assert.equal(enrollmentNotification.deduplication_key, `admin:enrollment-created:${enrollmentId}`);

  const checkoutNotification = await findEnrollmentNotification(enrollmentId, "admin.checkout.completed");
  assert.equal(checkoutNotification, null, "admin.checkout.completed não deveria disparar para um pagamento externo admin");
});

test("adminEnrollmentService.createEnrollment (matrícula-primeiro): gera admin.enrollment.created, nunca admin.checkout.completed", async () => {
  const student = await createStudent(db, {
    name: "Aluno Teste Notif Wizard",
    email: testEmail("notif-wizard"),
    password: "senha123",
    birth_date: "2000-05-01",
    cpf: testCpf(52),
    phone: "11999990052",
  });

  const enrollment = await createEnrollment(db, {
    student_id: student.id,
    course_id: courseId,
    pricing_plan_id: planId,
  });

  const enrollmentId = enrollment.id;
  assert.ok(enrollmentId);

  const enrollmentNotification = await findEnrollmentNotification(enrollmentId, "admin.enrollment.created");
  assert.ok(enrollmentNotification, "admin.enrollment.created deveria ter sido criada");
  createdEnrollmentNotificationIds.push(enrollmentNotification.id);

  const checkoutNotification = await findEnrollmentNotification(enrollmentId, "admin.checkout.completed");
  assert.equal(checkoutNotification, null, "admin.checkout.completed não deveria disparar para a matrícula-primeiro do wizard");
});
