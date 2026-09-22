const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();
require("../../services/notifications/eventDefinitions");

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");
const { getOperationsSummary } = require("../../services/dashboard/adminDashboardService");
const { openAdministrativeTicket, assignAdministrativeTicket } = require("../../services/chat/chatAdministrativeSupportService");
const { resolveConversation } = require("../../services/chat/chatConversationService");
const { createContactRequest } = require("../../services/public/publicContactService");
const { updateContactRequestStatus } = require("../../services/admin/adminContactService");
const { markAsRead, archiveNotification } = require("../../services/notifications/notificationQueryService");
const {
  findOrCreateSelfContractingPartyForStudent,
} = require("../../services/financial/contractingPartyService");

const RUN_ID = Date.now();
const COURSE_NAME = `TEST ADMIN DASHBOARD COURSE ${RUN_ID}`;

// Aluno real com matrícula no curso 5, já usado por outros arquivos
// financeiros desta suíte só para abrir tickets/ler -- aqui é usado
// só para abrir o requerimento administrativo (não grava nada em
// enrollments/financial_contracts deste aluno).
const STUDENT_USER_ID = 82;
const ADMIN_USER_ID = 42;

let courseId;
let planId;
let studentId;
let studentUserId;
let contractId;
let invoiceId;
let conversationId;
let contactRequestId;

function testEmail(label) {
  return `test.admindashboard.${RUN_ID}.${label}@example.com`;
}

function testCpf(sequence) {
  const digits = String(RUN_ID).slice(-6) + String(sequence).padStart(3, "0");

  return digits.slice(0, 9).padEnd(9, "0") + "00";
}

before(async () => {
  const [courseResult] = await db.promise().query(
    `
      INSERT INTO courses (teacher_id, name, description, workload_hours, price, status, nivel, created_at, updated_at)
      VALUES (NULL, ?, 'Curso de teste (dashboard admin)', 10, 0, 'active', 'Iniciante', NOW(), NOW())
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

  const [userResult] = await db.promise().query(
    `
      INSERT INTO users (name, email, password_hash, gender, role, status, created_at, updated_at)
      VALUES (?, ?, NULL, NULL, 'student', 'active', NOW(), NOW())
    `,
    [`Test Admin Dashboard Student ${RUN_ID}`, testEmail("student")]
  );

  studentUserId = userResult.insertId;

  const [studentResult] = await db.promise().query(
    `
      INSERT INTO students (user_id, name, email, gender, registration_number, birth_date, cpf, phone, address, status, created_at, updated_at)
      VALUES (?, ?, ?, 'Outro', ?, '2000-01-01', ?, '11900000000', 'Rua Teste', 'active', NOW(), NOW())
    `,
    [studentUserId, `Test Admin Dashboard Student ${RUN_ID}`, testEmail("student"), `DASH${RUN_ID}`, testCpf(1)]
  );

  studentId = studentResult.insertId;
});

async function cleanupTicket() {
  if (!conversationId) return;

  await retryOnDeadlock(() =>
    db
      .promise()
      .query(
        `DELETE FROM notification_deliveries WHERE recipient_id IN (SELECT id FROM notification_recipients WHERE notification_id IN (SELECT id FROM notifications WHERE source_type = 'chat_conversation' AND source_id = ?))`,
        [conversationId]
      )
  );
  await retryOnDeadlock(() =>
    db
      .promise()
      .query(
        `DELETE FROM notification_recipients WHERE notification_id IN (SELECT id FROM notifications WHERE source_type = 'chat_conversation' AND source_id = ?)`,
        [conversationId]
      )
  );
  await retryOnDeadlock(() =>
    db.promise().query(`DELETE FROM notifications WHERE source_type = 'chat_conversation' AND source_id = ?`, [
      conversationId,
    ])
  );
  await retryOnDeadlock(() =>
    db.promise().query(`UPDATE chat_conversations SET last_message_id = NULL WHERE id = ?`, [conversationId])
  );
  await retryOnDeadlock(() => db.promise().query(`DELETE FROM chat_messages WHERE conversation_id = ?`, [conversationId]));
  await retryOnDeadlock(() =>
    db.promise().query(`DELETE FROM chat_participants WHERE conversation_id = ?`, [conversationId])
  );
  await retryOnDeadlock(() => db.promise().query(`DELETE FROM chat_conversations WHERE id = ?`, [conversationId]));
}

async function cleanupContact() {
  if (!contactRequestId) return;

  const [notifs] = await db
    .promise()
    .query(`SELECT id FROM notifications WHERE source_type = 'public_contact_request' AND source_id = ?`, [
      contactRequestId,
    ]);

  for (const notification of notifs) {
    await retryOnDeadlock(() =>
      db
        .promise()
        .query(
          `DELETE FROM notification_deliveries WHERE recipient_id IN (SELECT id FROM notification_recipients WHERE notification_id = ?)`,
          [notification.id]
        )
    );
    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM notification_recipients WHERE notification_id = ?`, [notification.id])
    );
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM notifications WHERE id = ?`, [notification.id]));
  }

  await retryOnDeadlock(() =>
    db.promise().query(`DELETE FROM public_contact_requests WHERE id = ?`, [contactRequestId])
  );
}

after(async () => {
  await cleanupTicket();
  await cleanupContact();

  if (invoiceId) {
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM invoice_collection_actions WHERE invoice_id = ?`, [invoiceId]));
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM financial_events WHERE invoice_id = ?`, [invoiceId]));
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM invoices WHERE id = ?`, [invoiceId]));
  }

  if (contractId) {
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM financial_events WHERE financial_contract_id = ?`, [contractId]));
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM financial_contracts WHERE id = ?`, [contractId]));
  }

  await retryOnDeadlock(() => db.promise().query(`DELETE FROM financial_events WHERE enrollment_id IN (SELECT id FROM enrollments WHERE course_id = ?)`, [courseId]));
  await retryOnDeadlock(() => db.promise().query(`DELETE FROM enrollments WHERE course_id = ?`, [courseId]));

  if (studentId) {
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM student_contracting_parties WHERE student_id = ?`, [studentId]));
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM contracting_parties WHERE user_id = ?`, [studentUserId]));
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM students WHERE id = ?`, [studentId]));
  }

  if (studentUserId) {
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM users WHERE id = ?`, [studentUserId]));
  }

  await retryOnDeadlock(() => db.promise().query(`DELETE FROM course_pricing_plans WHERE course_id = ?`, [courseId]));
  await retryOnDeadlock(() => db.promise().query(`DELETE FROM courses WHERE id = ?`, [courseId]));

  await db.promise().end();
});

test("newUsersLast7Days: um usuário recém-criado aumenta a contagem em exatamente 1", async () => {
  const before = await getOperationsSummary(db);

  const [result] = await db.promise().query(
    `INSERT INTO users (name, email, password_hash, gender, role, status, created_at, updated_at)
     VALUES (?, ?, NULL, NULL, 'student', 'pending_activation', NOW(), NOW())`,
    [`Test Extra User ${Date.now()}`, testEmail("extra")]
  );

  const extraUserId = result.insertId;

  try {
    const after = await getOperationsSummary(db);

    assert.equal(after.newUsersLast7Days, before.newUsersLast7Days + 1);
  } finally {
    await db.promise().query(`DELETE FROM users WHERE id = ?`, [extraUserId]);
  }
});

test("completedCheckoutsLast7Days e newEnrollmentsLast7Days: enrollment de origin=public_checkout conta em ambos", async () => {
  const before = await getOperationsSummary(db);

  const [enrollmentResult] = await db.promise().query(
    `
      INSERT INTO enrollments (student_id, course_id, class_id, status, enrolled_at, origin, activated_at, created_at, updated_at)
      VALUES (?, ?, NULL, 'active', NOW(), 'commercial', NOW(), NOW(), NOW())
    `,
    [studentId, courseId]
  );

  const enrollmentId = enrollmentResult.insertId;

  const contractingPartyId = await findOrCreateSelfContractingPartyForStudent(db.promise(), { studentId });

  const [contractResult] = await db.promise().query(
    `
      INSERT INTO financial_contracts
        (enrollment_id, student_id, course_id, contracting_party_id, origin, pricing_plan_id, billing_type,
         plan_name, total_amount, status, start_date, activated_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'public_checkout', ?, 'one_time', 'TEST PLAN', 300.00, 'active', CURDATE(), NOW(), NOW(), NOW())
    `,
    [enrollmentId, studentId, courseId, contractingPartyId, planId]
  );

  contractId = contractResult.insertId;

  const after = await getOperationsSummary(db);

  assert.equal(after.newEnrollmentsLast7Days, before.newEnrollmentsLast7Days + 1);
  assert.equal(after.completedCheckoutsLast7Days, before.completedCheckoutsLast7Days + 1);
});

test("overdueInvoices/invoicesOverdue15Days/invoicesOverdue30Days: cada faixa conta corretamente, e uma fatura paga deixa de contar", async () => {
  assert.ok(contractId, "depende do teste anterior ter criado o contrato");

  const before = await getOperationsSummary(db);

  const [invoiceResult] = await db.promise().query(
    `
      INSERT INTO invoices (financial_contract_id, invoice_type, installment_number, description, amount, due_date, status, created_at, updated_at)
      VALUES (?, 'monthly_payment', 1, 'TEST invoice dashboard', 300.00, DATE_SUB(CURDATE(), INTERVAL 20 DAY), 'pending', NOW(), NOW())
    `,
    [contractId]
  );

  invoiceId = invoiceResult.insertId;

  const at20Days = await getOperationsSummary(db);

  assert.equal(at20Days.overdueInvoices, before.overdueInvoices + 1);
  assert.equal(at20Days.invoicesOverdue15Days, before.invoicesOverdue15Days + 1);
  assert.equal(at20Days.invoicesOverdue30Days, before.invoicesOverdue30Days, "20 dias não deveria contar como 30+");

  await db.promise().query(`UPDATE invoices SET due_date = DATE_SUB(CURDATE(), INTERVAL 31 DAY) WHERE id = ?`, [
    invoiceId,
  ]);

  const at31Days = await getOperationsSummary(db);

  assert.equal(at31Days.invoicesOverdue30Days, before.invoicesOverdue30Days + 1);
  assert.equal(at31Days.invoicesOverdue15Days, before.invoicesOverdue15Days + 1);

  // Invoice paga deixa de contar em qualquer uma das três faixas
  // (seção 22) -- confirma que o critério é sempre "dívida
  // efetivamente aberta", nunca um estado congelado.
  await db.promise().query(`UPDATE invoices SET status = 'paid', paid_at = NOW() WHERE id = ?`, [invoiceId]);

  const afterPaid = await getOperationsSummary(db);

  assert.equal(afterPaid.overdueInvoices, before.overdueInvoices);
  assert.equal(afterPaid.invoicesOverdue15Days, before.invoicesOverdue15Days);
  assert.equal(afterPaid.invoicesOverdue30Days, before.invoicesOverdue30Days);
});

test("openAdministrativeRequests/unassignedAdministrativeRequests: ticket aberto conta, atribuído sai de 'sem responsável', resolvido sai de 'aberto'", async () => {
  const before = await getOperationsSummary(db);

  const { conversationId: newConversationId } = await openAdministrativeTicket(db, {
    userId: STUDENT_USER_ID,
    category: "request",
    subject: `TEST ADMIN DASHBOARD ticket ${Date.now()}`,
    body: "Corpo de teste para o dashboard administrativo.",
  });

  conversationId = newConversationId;

  const afterOpen = await getOperationsSummary(db);

  assert.equal(afterOpen.openAdministrativeRequests, before.openAdministrativeRequests + 1);
  assert.equal(afterOpen.unassignedAdministrativeRequests, before.unassignedAdministrativeRequests + 1);

  await assignAdministrativeTicket(db, { conversationId, adminUserId: ADMIN_USER_ID });

  const afterAssign = await getOperationsSummary(db);

  assert.equal(afterAssign.unassignedAdministrativeRequests, before.unassignedAdministrativeRequests, "atribuído sai de 'sem responsável'");
  assert.equal(afterAssign.openAdministrativeRequests, before.openAdministrativeRequests + 1, "ainda aberto");

  await resolveConversation(db, { conversationId, userId: ADMIN_USER_ID });

  const afterResolve = await getOperationsSummary(db);

  assert.equal(afterResolve.openAdministrativeRequests, before.openAdministrativeRequests, "resolvido sai de 'aberto'");
});

test("newPublicContacts: contato novo conta, resolvido deixa de contar -- e arquivar/ler a notificação nunca muda o número", async () => {
  const before = await getOperationsSummary(db);

  const created = await createContactRequest(db, {
    name: "Test Dashboard Contact",
    email: testEmail("contact"),
    subject: "TEST ADMIN DASHBOARD contact",
    message: "Mensagem de teste para o dashboard.",
  });

  contactRequestId = created.id;

  const afterCreate = await getOperationsSummary(db);
  assert.equal(afterCreate.newPublicContacts, before.newPublicContacts + 1);

  // Seção 22: marcar a notificação como lida/arquivada nunca altera o
  // indicador -- o indicador vem só de public_contact_requests.status.
  const [[notification]] = await db
    .promise()
    .query(`SELECT id FROM notifications WHERE source_type = 'public_contact_request' AND source_id = ?`, [
      contactRequestId,
    ]);

  if (notification) {
    const [[recipient]] = await db
      .promise()
      .query(`SELECT id FROM notification_recipients WHERE notification_id = ? LIMIT 1`, [notification.id]);

    if (recipient) {
      await markAsRead(db, { userId: ADMIN_USER_ID, notificationId: notification.id });
      await archiveNotification(db, { userId: ADMIN_USER_ID, notificationId: notification.id });
    }
  }

  const afterNotificationMutation = await getOperationsSummary(db);
  assert.equal(
    afterNotificationMutation.newPublicContacts,
    before.newPublicContacts + 1,
    "ler/arquivar a notificação não deveria alterar o indicador"
  );

  await updateContactRequestStatus(db, contactRequestId, "resolved");

  const afterResolved = await getOperationsSummary(db);
  assert.equal(afterResolved.newPublicContacts, before.newPublicContacts);
});

test("studentsWithoutClass: matrícula ativa sem turma conta; com turma, deixa de contar", async () => {
  const before = await getOperationsSummary(db);

  const [userResult] = await db.promise().query(
    `INSERT INTO users (name, email, password_hash, gender, role, status, created_at, updated_at)
     VALUES (?, ?, NULL, NULL, 'student', 'active', NOW(), NOW())`,
    [`Test Dashboard No Class ${RUN_ID}`, testEmail("noclass")]
  );
  const noClassStudentUserId = userResult.insertId;

  const [studentResult] = await db.promise().query(
    `INSERT INTO students (user_id, name, email, gender, registration_number, birth_date, cpf, phone, address, status, created_at, updated_at)
     VALUES (?, ?, ?, 'Outro', ?, '2000-01-01', ?, '11900000000', 'Rua Teste', 'active', NOW(), NOW())`,
    [noClassStudentUserId, `Test Dashboard No Class ${RUN_ID}`, testEmail("noclass"), `DASHNC${RUN_ID}`, `NC${RUN_ID}00`]
  );
  const noClassStudentId = studentResult.insertId;

  const [enrollmentResult] = await db.promise().query(
    `INSERT INTO enrollments (student_id, course_id, class_id, status, enrolled_at, created_at, updated_at)
     VALUES (?, ?, NULL, 'active', NOW(), NOW(), NOW())`,
    [noClassStudentId, courseId]
  );
  const noClassEnrollmentId = enrollmentResult.insertId;

  try {
    const afterNoClass = await getOperationsSummary(db);
    assert.equal(afterNoClass.studentsWithoutClass, before.studentsWithoutClass + 1);

    const [[classRow]] = await db.promise().query(`SELECT id FROM classes WHERE course_id = ? LIMIT 1`, [courseId]);

    if (classRow) {
      await db.promise().query(`UPDATE enrollments SET class_id = ? WHERE id = ?`, [classRow.id, noClassEnrollmentId]);

      const afterAssigned = await getOperationsSummary(db);
      assert.equal(afterAssigned.studentsWithoutClass, before.studentsWithoutClass);
    }
  } finally {
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM financial_events WHERE enrollment_id = ?`, [noClassEnrollmentId]));
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM enrollments WHERE id = ?`, [noClassEnrollmentId]));
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM students WHERE id = ?`, [noClassStudentId]));
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM users WHERE id = ?`, [noClassStudentUserId]));
  }
});

test("pendingEnrollments: contrato preso em pending_payment com fatura de ativação paga conta; contrato ativo ou cancelado não conta", async () => {
  const before = await getOperationsSummary(db);

  const [userResult] = await db.promise().query(
    `INSERT INTO users (name, email, password_hash, gender, role, status, created_at, updated_at)
     VALUES (?, ?, NULL, NULL, 'student', 'active', NOW(), NOW())`,
    [`Test Dashboard Pending ${RUN_ID}`, testEmail("pending")]
  );
  const pendingStudentUserId = userResult.insertId;

  const [studentResult] = await db.promise().query(
    `INSERT INTO students (user_id, name, email, gender, registration_number, birth_date, cpf, phone, address, status, created_at, updated_at)
     VALUES (?, ?, ?, 'Outro', ?, '2000-01-01', ?, '11900000000', 'Rua Teste', 'active', NOW(), NOW())`,
    [pendingStudentUserId, `Test Dashboard Pending ${RUN_ID}`, testEmail("pending"), `DASHP${RUN_ID}`, `PD${RUN_ID}00`]
  );
  const pendingStudentId = studentResult.insertId;

  const [enrollmentResult] = await db.promise().query(
    `INSERT INTO enrollments (student_id, course_id, class_id, status, enrolled_at, created_at, updated_at)
     VALUES (?, ?, NULL, 'inactive', NOW(), NOW(), NOW())`,
    [pendingStudentId, courseId]
  );
  const pendingEnrollmentId = enrollmentResult.insertId;

  const pendingContractingPartyId = await findOrCreateSelfContractingPartyForStudent(db.promise(), {
    studentId: pendingStudentId,
  });

  const [pendingContractResult] = await db.promise().query(
    `INSERT INTO financial_contracts
       (enrollment_id, student_id, course_id, contracting_party_id, origin, pricing_plan_id, billing_type,
        plan_name, total_amount, status, start_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'admin', ?, 'one_time', 'TEST DASHBOARD PENDING PLAN', 300.00, 'pending_payment', CURDATE(), NOW(), NOW())`,
    [pendingEnrollmentId, pendingStudentId, courseId, pendingContractingPartyId, planId]
  );
  const pendingContractId = pendingContractResult.insertId;

  const [pendingInvoiceResult] = await db.promise().query(
    `INSERT INTO invoices (financial_contract_id, invoice_type, installment_number, description, amount, due_date, status, paid_at, created_at, updated_at)
     VALUES (?, 'full_payment', 1, 'TEST DASHBOARD PENDING invoice', 300.00, CURDATE(), 'paid', NOW(), NOW(), NOW())`,
    [pendingContractId]
  );
  const pendingInvoiceId = pendingInvoiceResult.insertId;

  await db.promise().query(`UPDATE financial_contracts SET activation_invoice_id = ? WHERE id = ?`, [
    pendingInvoiceId,
    pendingContractId,
  ]);

  try {
    const afterStuck = await getOperationsSummary(db);
    assert.equal(afterStuck.pendingEnrollments, before.pendingEnrollments + 1);

    // Resolvendo o problema (ativando o contrato "de verdade"): deixa
    // de contar.
    await db.promise().query(`UPDATE financial_contracts SET status = 'active' WHERE id = ?`, [pendingContractId]);
    await db.promise().query(`UPDATE enrollments SET status = 'active' WHERE id = ?`, [pendingEnrollmentId]);

    const afterActivated = await getOperationsSummary(db);
    assert.equal(afterActivated.pendingEnrollments, before.pendingEnrollments);

    // Um contrato cancelado nunca deveria contar como "pendência" --
    // é um encerramento deliberado, não um problema de ativação.
    await db.promise().query(`UPDATE financial_contracts SET status = 'cancelled' WHERE id = ?`, [pendingContractId]);
    await db.promise().query(`UPDATE enrollments SET status = 'cancelled' WHERE id = ?`, [pendingEnrollmentId]);

    const afterCancelled = await getOperationsSummary(db);
    assert.equal(afterCancelled.pendingEnrollments, before.pendingEnrollments);
  } finally {
    await retryOnDeadlock(() =>
      db.promise().query(`UPDATE financial_contracts SET activation_invoice_id = NULL WHERE id = ?`, [pendingContractId])
    );
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM invoices WHERE id = ?`, [pendingInvoiceId]));
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM financial_events WHERE financial_contract_id = ?`, [pendingContractId]));
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM financial_contracts WHERE id = ?`, [pendingContractId]));
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM financial_events WHERE enrollment_id = ?`, [pendingEnrollmentId]));
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM enrollments WHERE id = ?`, [pendingEnrollmentId]));
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM student_contracting_parties WHERE student_id = ?`, [pendingStudentId]));
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM contracting_parties WHERE user_id = ?`, [pendingStudentUserId]));
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM students WHERE id = ?`, [pendingStudentId]));
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM users WHERE id = ?`, [pendingStudentUserId]));
  }
});
