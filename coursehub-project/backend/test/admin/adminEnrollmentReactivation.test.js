const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();
require("../../services/notifications/eventDefinitions");

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");

const { updateEnrollmentStatus, listEnrollments } = require("../../services/admin/adminEnrollmentService");
const { createStudentContractWithInitialInvoice } = require("../../services/financial/contractCreationService");
const { registerManualPayment } = require("../../services/financial/paymentService");
const {
  findOrCreateSelfContractingPartyForStudent,
} = require("../../services/financial/contractingPartyService");

const RUN_ID = Date.now();
const COURSE_NAME = `TEST ENROLLMENT REACTIVATION COURSE ${RUN_ID}`;
const ADMIN_USER_ID = 42;

let courseId;
let planId;
const createdStudentUserIds = [];
const createdContractIds = [];
const createdEnrollmentIds = [];

function testEmail(label) {
  return `test.enrollreactivation.${RUN_ID}.${label}@example.com`;
}

function testCpf(sequence) {
  const digits = String(RUN_ID).slice(-6) + String(sequence).padStart(3, "0");

  return digits.slice(0, 9).padEnd(9, "0") + "00";
}

before(async () => {
  const [courseResult] = await db.promise().query(
    `
      INSERT INTO courses (teacher_id, name, description, workload_hours, price, status, nivel, created_at, updated_at)
      VALUES (NULL, ?, 'Curso de teste (reativação de matrícula)', 10, 0, 'active', 'Iniciante', NOW(), NOW())
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

/**
 * Cria contrato + fatura de ativação já paga (activateContractFromPaidInvoice
 * roda dentro de registerManualPayment) -- devolve {enrollmentId, contractId, studentId}
 * com contract.status='active' e enrollment.status='active'.
 */
async function createActiveEnrollmentWithContract(label) {
  const result = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: {
        name: `Reactivation Test ${label}`,
        email: testEmail(label),
        birth_date: "2000-01-01",
        cpf: testCpf(createdStudentUserIds.length + 1),
        phone: "11900000000",
      },
      contractingPartyMode: "self",
      courseId,
      pricingPlanId: planId,
      billingData: { dueDate: "2026-12-01" },
    },
    ADMIN_USER_ID
  );

  const paymentResult = await registerManualPayment(db, {
    invoiceId: result.invoiceId,
    amount: 300,
    paymentMethod: "pix",
    paymentDate: new Date().toISOString(),
    reason: `Teste automatizado (reativação de matrícula ${label})`,
    actorUserId: ADMIN_USER_ID,
  });

  const enrollmentId = paymentResult.activationResult.enrollmentId;
  const contractId = result.contractId;

  createdEnrollmentIds.push(enrollmentId);
  createdContractIds.push(contractId);

  const [[studentRow]] = await db.promise().query(`SELECT user_id FROM students WHERE id = ?`, [result.studentId]);
  createdStudentUserIds.push(studentRow.user_id);

  return { enrollmentId, contractId, studentId: result.studentId };
}

/**
 * Aluno descartável direto via SQL, sem contrato -- usado pelos
 * testes que não precisam do fluxo completo de contratação (evita
 * colidir com o UNIQUE(student_id, course_id) de enrollments quando
 * vários testes usam o mesmo curso).
 */
async function createPlainTestStudent(label) {
  const [userResult] = await db.promise().query(
    `INSERT INTO users (name, email, password_hash, gender, role, status, created_at, updated_at)
     VALUES (?, ?, NULL, NULL, 'student', 'active', NOW(), NOW())`,
    [`Reactivation Plain Student ${label}`, testEmail(`plain-${label}`)]
  );

  const studentUserId = userResult.insertId;
  createdStudentUserIds.push(studentUserId);

  const [studentResult] = await db.promise().query(
    `INSERT INTO students (user_id, name, email, gender, registration_number, birth_date, cpf, phone, address, status, created_at, updated_at)
     VALUES (?, ?, ?, 'Outro', ?, '2000-01-01', ?, '11900000000', 'Rua Teste', 'active', NOW(), NOW())`,
    [
      studentUserId,
      `Reactivation Plain Student ${label}`,
      testEmail(`plain-${label}`),
      `REACT${RUN_ID}${label}`,
      testCpf(100 + createdStudentUserIds.length),
    ]
  );

  return studentResult.insertId;
}

async function purgeEnrollmentAndContract(enrollmentId, contractId) {
  if (contractId) {
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM financial_events WHERE financial_contract_id = ?`, [contractId]));
    await retryOnDeadlock(() =>
      db
        .promise()
        .query(
          `DELETE pe FROM payment_events pe INNER JOIN payments p ON p.id = pe.payment_id INNER JOIN invoices i ON i.id = p.invoice_id WHERE i.financial_contract_id = ?`,
          [contractId]
        )
    );
    await retryOnDeadlock(() =>
      db.promise().query(`DELETE p FROM payments p INNER JOIN invoices i ON i.id = p.invoice_id WHERE i.financial_contract_id = ?`, [contractId])
    );
    await retryOnDeadlock(() =>
      db.promise().query(`UPDATE financial_contracts SET activation_invoice_id = NULL WHERE id = ?`, [contractId])
    );
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM invoices WHERE financial_contract_id = ?`, [contractId]));
  }

  if (enrollmentId) {
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM financial_events WHERE enrollment_id = ?`, [enrollmentId]));
  }

  if (contractId) {
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM financial_contracts WHERE id = ?`, [contractId]));
  }

  if (enrollmentId) {
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM enrollments WHERE id = ?`, [enrollmentId]));
  }
}

after(async () => {
  for (let i = 0; i < createdEnrollmentIds.length; i += 1) {
    await purgeEnrollmentAndContract(createdEnrollmentIds[i], createdContractIds[i]);
  }

  for (const studentUserId of createdStudentUserIds) {
    const [[studentRow]] = await db.promise().query(`SELECT id FROM students WHERE user_id = ?`, [studentUserId]);

    if (studentRow) {
      await retryOnDeadlock(() =>
        db.promise().query(`DELETE FROM student_contracting_parties WHERE student_id = ?`, [studentRow.id])
      );
      await retryOnDeadlock(() => db.promise().query(`DELETE FROM students WHERE id = ?`, [studentRow.id]));
    }

    await retryOnDeadlock(() => db.promise().query(`DELETE FROM contracting_parties WHERE user_id = ?`, [studentUserId]));
    await retryOnDeadlock(() => db.promise().query(`DELETE FROM users WHERE id = ?`, [studentUserId]));
  }

  await retryOnDeadlock(() => db.promise().query(`DELETE FROM course_pricing_plans WHERE course_id = ?`, [courseId]));
  await retryOnDeadlock(() => db.promise().query(`DELETE FROM courses WHERE id = ?`, [courseId]));

  await db.promise().end();
});

test("enrollment sem contrato: reativação continua funcionando normalmente", async () => {
  const studentId = await createPlainTestStudent("no-contract");

  const [result] = await db.promise().query(
    `
      INSERT INTO enrollments (student_id, course_id, class_id, status, enrolled_at, created_at, updated_at)
      VALUES (?, ?, NULL, 'inactive', NOW(), NOW(), NOW())
    `,
    [studentId, courseId]
  );

  const enrollmentId = result.insertId;
  createdEnrollmentIds.push(enrollmentId);
  createdContractIds.push(null);

  const updated = await updateEnrollmentStatus(db, enrollmentId, "active");

  assert.equal(updated.status, "active");
});

test("enrollment + contrato active: reativação permitida", async () => {
  const { enrollmentId } = await createActiveEnrollmentWithContract("active-contract");

  await updateEnrollmentStatus(db, enrollmentId, "inactive");

  const reactivated = await updateEnrollmentStatus(db, enrollmentId, "active");

  assert.equal(reactivated.status, "active");
});

test("enrollment + contrato cancelled: backend bloqueia com 409 e mensagem clara", async () => {
  const { enrollmentId, contractId } = await createActiveEnrollmentWithContract("cancelled-contract");

  await updateEnrollmentStatus(db, enrollmentId, "inactive");

  await db.promise().query(
    `UPDATE financial_contracts SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW() WHERE id = ?`,
    [contractId]
  );

  await assert.rejects(
    () => updateEnrollmentStatus(db, enrollmentId, "active"),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /contrato vinculado está cancelado/);
      return true;
    }
  );

  // O contrato continua cancelado -- nada foi recriado/reativado
  // automaticamente por trás da tentativa bloqueada.
  const [[contractRow]] = await db.promise().query(`SELECT status FROM financial_contracts WHERE id = ?`, [contractId]);
  assert.equal(contractRow.status, "cancelled");

  const [[enrollmentRow]] = await db.promise().query(`SELECT status FROM enrollments WHERE id = ?`, [enrollmentId]);
  assert.equal(enrollmentRow.status, "inactive");
});

test("tentar contornar pelo backend diretamente (sem passar pelo frontend) continua bloqueado -- mesma function, chamada direta", async () => {
  const { enrollmentId, contractId } = await createActiveEnrollmentWithContract("bypass-attempt");

  await updateEnrollmentStatus(db, enrollmentId, "cancelled");

  await db.promise().query(
    `UPDATE financial_contracts SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW() WHERE id = ?`,
    [contractId]
  );

  // Simula uma chamada de API direta (PATCH /api/admin/enrollments/:id/status
  // chama exatamente esta function, sem lógica adicional) -- não há
  // como contornar via requisição HTTP direta o que já é bloqueado aqui.
  await assert.rejects(
    () => updateEnrollmentStatus(db, enrollmentId, "active"),
    (error) => error.statusCode === 409
  );
});

test("enrollment + contrato pending_payment: backend bloqueia ativação com 409 e mensagem clara", async () => {
  // Estado sintético via SQL direto (não alcançável pelo fluxo normal
  // de produção -- activateContractFromPaidInvoice sempre define
  // enrollment_id e status='active' na MESMA transação, então um
  // contrato nunca fica pending_payment já vinculado a uma
  // enrollment em operação normal). Exercita a guarda mesmo assim,
  // igual ao padrão já usado em contractWithdrawal.test.js para o
  // mesmo tipo de cenário defensivo.
  const studentId = await createPlainTestStudent("pending-payment");

  const [enrollmentResult] = await db.promise().query(
    `
      INSERT INTO enrollments (student_id, course_id, class_id, status, enrolled_at, created_at, updated_at)
      VALUES (?, ?, NULL, 'inactive', NOW(), NOW(), NOW())
    `,
    [studentId, courseId]
  );

  const enrollmentId = enrollmentResult.insertId;
  createdEnrollmentIds.push(enrollmentId);

  const contractingPartyId = await findOrCreateSelfContractingPartyForStudent(db.promise(), { studentId });

  const [contractResult] = await db.promise().query(
    `
      INSERT INTO financial_contracts
        (enrollment_id, student_id, course_id, contracting_party_id, origin,
         pricing_plan_id, billing_type, plan_name, total_amount, status, start_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'admin', ?, 'one_time', 'TEST PENDING PLAN', 300.00, 'pending_payment', CURDATE(), NOW(), NOW())
    `,
    [enrollmentId, studentId, courseId, contractingPartyId, planId]
  );

  const contractId = contractResult.insertId;
  createdContractIds.push(contractId);

  await assert.rejects(
    () => updateEnrollmentStatus(db, enrollmentId, "active"),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /aguardando pagamento/);
      return true;
    }
  );

  const [[stillInactive]] = await db.promise().query(`SELECT status FROM enrollments WHERE id = ?`, [enrollmentId]);
  assert.equal(stillInactive.status, "inactive");
});

test("enrollment + contrato overdue: mantém a política existente -- reativação permitida (overdue não é bloqueio novo)", async () => {
  const { enrollmentId, contractId } = await createActiveEnrollmentWithContract("overdue-contract");

  await updateEnrollmentStatus(db, enrollmentId, "inactive");

  await db.promise().query(`UPDATE financial_contracts SET status = 'overdue' WHERE id = ?`, [contractId]);

  const reactivated = await updateEnrollmentStatus(db, enrollmentId, "active");

  assert.equal(reactivated.status, "active");
});

test("listEnrollments(classStatus=unassigned): só matrículas ativas sem turma", async () => {
  const { enrollmentId } = await createActiveEnrollmentWithContract("unassigned-class");

  const result = await listEnrollments(db, { classStatus: "unassigned", limit: 200 });

  assert.ok(result.data.some((item) => item.id === enrollmentId));
  assert.ok(result.data.every((item) => item.class === null && item.status === "active"));
});

test("listEnrollments(status=pending_activation): não inclui contrato ainda genuinamente aguardando pagamento", async () => {
  const result = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: {
        name: "Reactivation Test still-pending",
        email: testEmail("still-pending"),
        birth_date: "2000-01-01",
        cpf: testCpf(createdStudentUserIds.length + 1),
        phone: "11900000000",
      },
      contractingPartyMode: "self",
      courseId,
      pricingPlanId: planId,
      billingData: { dueDate: "2026-12-01" },
    },
    ADMIN_USER_ID
  );

  createdContractIds.push(result.contractId);
  createdEnrollmentIds.push(null);

  const [[studentRow]] = await db.promise().query(`SELECT user_id FROM students WHERE id = ?`, [result.studentId]);
  createdStudentUserIds.push(studentRow.user_id);

  const pending = await listEnrollments(db, { status: "pending_activation", limit: 200 });

  // O contrato ainda não tem enrollment (nunca foi pago), então nem
  // aparece aqui -- confirma que esta listagem (ao contrário do card
  // do dashboard) não pode representar "matrícula ainda não criada",
  // limitação documentada no código.
  assert.equal(pending.data.some((item) => item.financialContract?.id === result.contractId), false);
});
