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
  cancelFinancialContract,
} = require("../../services/financial/contractCancellationService");
const {
  activateContractFromPaidInvoice,
} = require("../../services/financial/activateContractService");
const { registerManualPayment } = require("../../services/financial/paymentService");
const { changeInvoiceAmount } = require("../../services/financial/invoiceAmountService");
const {
  activateAccount,
  validateActivationToken,
} = require("../../services/auth/accountActivationService");
const { createActivationToken } = require("../../repositories/accountActivationTokens");
const { login } = require("../../services/auth/authService");
const {
  createContractingParty,
} = require("../../services/financial/contractingPartyService");

// Fixture: um curso e um plano de preço descartáveis (mesma
// convenção de test/courses/coursePricingPlan.test.js) -- nunca toca
// o catálogo real. actorUserId usa um admin real e apenas de leitura
// (nunca modificado por este arquivo).
const COURSE_NAME = "TEST CONTRACTING FLOW COURSE";
const RUN_ID = Date.now();

let courseId;
let planId;
let adminUserId;

function testCpf(sequence) {
  const digits = String(RUN_ID).slice(-6) + String(sequence).padStart(3, "0");

  return digits.slice(0, 9).padEnd(9, "0") + "00";
}

function testEmail(label) {
  return `contracting.flow.${RUN_ID}.${label}@example.com`;
}

async function cleanupStaleFixtures() {
  const [staleCourses] = await db
    .promise()
    .query(`SELECT id FROM courses WHERE name = ?`, [COURSE_NAME]);

  for (const course of staleCourses) {
    await purgeCourseData(course.id);
  }

  // Documento fixo usado pelo teste "cria contratante terceiro valido"
  // -- se uma execucao anterior quebrou antes do proprio cleanup do
  // teste rodar, isto evita ER_DUP_ENTRY na proxima execucao.
  await db
    .promise()
    .query(`DELETE FROM contracting_parties WHERE document_number = '52998224725' AND user_id IS NULL`);
}

async function purgeCourseData(targetCourseId) {
  const [contracts] = await db
    .promise()
    .query(`SELECT id FROM financial_contracts WHERE course_id = ?`, [targetCourseId]);

  for (const contract of contracts) {
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

  const [enrollments] = await db
    .promise()
    .query(`SELECT id FROM enrollments WHERE course_id = ?`, [targetCourseId]);

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
    const [studentRows] = await db
      .promise()
      .query(`SELECT user_id FROM students WHERE id = ?`, [studentId]);

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

before(async () => {
  await cleanupStaleFixtures();

  const [adminRows] = await db.promise().query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
  adminUserId = adminRows[0].id;

  const [courseResult] = await db.promise().query(
    `
      INSERT INTO courses (teacher_id, name, description, workload_hours, price, status, nivel, created_at, updated_at)
      VALUES (NULL, ?, 'Curso de teste (fluxo de contratacao)', 10, 0, 'draft', 'Iniciante', NOW(), NOW())
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
});

after(async () => {
  await retryOnDeadlock(() => purgeCourseData(courseId));

  await db
    .promise()
    .query(`DELETE FROM contracting_parties WHERE document_number = '52998224725' AND user_id IS NULL`);

  await db.promise().end();
});

test("createStudentContractWithInitialInvoice: novo aluno em modo self nasce pending_activation, sem senha, contrato pending_payment sem matricula", async () => {
  const email = testEmail("self-new");

  const result = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: {
        name: "Aluno Teste Self",
        email,
        birth_date: "2000-05-01",
        cpf: testCpf(1),
        phone: "11999990001",
      },
      contractingPartyMode: "self",
      courseId,
      pricingPlanId: planId,
      billingData: { dueDate: "2026-12-01" },
    },
    adminUserId
  );

  assert.equal(result.status, "pending_payment");

  const [contractRows] = await db
    .promise()
    .query(`SELECT status, enrollment_id, student_id, course_id, contracting_party_id, origin FROM financial_contracts WHERE id = ?`, [
      result.contractId,
    ]);

  assert.equal(contractRows[0].status, "pending_payment");
  assert.equal(contractRows[0].enrollment_id, null);
  assert.equal(contractRows[0].origin, "admin");

  const [userRows] = await db.promise().query(
    `SELECT u.status, u.password_hash FROM users u INNER JOIN students s ON s.user_id = u.id WHERE s.id = ?`,
    [result.studentId]
  );

  assert.equal(userRows[0].status, "pending_activation");
  assert.equal(userRows[0].password_hash, null);

  const loginAttempt = await login(db, { email, password: "anything123" }).catch((error) => error);
  assert.equal(loginAttempt.statusCode, 403);
});

test("pagamento da fatura de ativacao cria matricula, ativa o contrato e e idempotente", async () => {
  const email = testEmail("activation");

  const result = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: {
        name: "Aluno Teste Ativacao",
        email,
        birth_date: "2000-05-01",
        cpf: testCpf(2),
        phone: "11999990002",
      },
      contractingPartyMode: "self",
      courseId,
      pricingPlanId: planId,
      billingData: { dueDate: "2026-12-01" },
    },
    adminUserId
  );

  const paymentResult = await registerManualPayment(db, {
    invoiceId: result.invoiceId,
    amount: 500,
    paymentMethod: "pix",
    paymentDate: new Date().toISOString(),
    reason: "Teste automatizado",
    actorUserId: adminUserId,
  });

  assert.equal(paymentResult.activationResult.activated, true);
  assert.ok(paymentResult.activationResult.enrollmentId);

  const [contractRows] = await db
    .promise()
    .query(`SELECT status, enrollment_id FROM financial_contracts WHERE id = ?`, [result.contractId]);

  assert.equal(contractRows[0].status, "active");
  assert.equal(contractRows[0].enrollment_id, paymentResult.activationResult.enrollmentId);

  const [tokenRows] = await db.promise().query(
    `SELECT id FROM account_activation_tokens WHERE user_id = (SELECT user_id FROM students WHERE id = ?)`,
    [result.studentId]
  );

  assert.equal(tokenRows.length, 1);

  // Idempotencia: repetir a ativacao para a mesma fatura nunca cria uma segunda matricula.
  const repeat = await activateContractFromPaidInvoice(db, result.invoiceId, {});

  assert.equal(repeat.alreadyActivated, true);
  assert.equal(repeat.enrollmentId, paymentResult.activationResult.enrollmentId);

  const [enrollmentCountRows] = await db
    .promise()
    .query(`SELECT COUNT(*) AS total FROM enrollments WHERE student_id = ? AND course_id = ?`, [
      result.studentId,
      courseId,
    ]);

  assert.equal(Number(enrollmentCountRows[0].total), 1);
});

test("ativacao de conta: define senha, marca usuario ativo, token de uso unico e permite login", async () => {
  const email = testEmail("full-cycle");

  const result = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: {
        name: "Aluno Teste Ciclo Completo",
        email,
        birth_date: "2000-05-01",
        cpf: testCpf(3),
        phone: "11999990003",
      },
      contractingPartyMode: "self",
      courseId,
      pricingPlanId: planId,
      billingData: { dueDate: "2026-12-01" },
    },
    adminUserId
  );

  await registerManualPayment(db, {
    invoiceId: result.invoiceId,
    amount: 500,
    paymentMethod: "pix",
    paymentDate: new Date().toISOString(),
    reason: "Teste automatizado",
    actorUserId: adminUserId,
  });

  const [studentRows] = await db.promise().query(`SELECT user_id FROM students WHERE id = ?`, [
    result.studentId,
  ]);

  const userId = studentRows[0].user_id;

  const [existingTokenRows] = await db
    .promise()
    .query(`SELECT token_hash FROM account_activation_tokens WHERE user_id = ?`, [userId]);

  assert.equal(existingTokenRows.length, 1, "a ativacao automatica ja deve ter criado um token");

  // O token bruto nunca fica acessivel apos criado (so o hash persiste) --
  // para testar o consumo, geramos um novo token diretamente pelo
  // repositorio, que e a mesma funcao usada internamente.
  const { rawToken } = await createActivationToken(db.promise(), userId);

  const validation = await validateActivationToken(db, rawToken);
  assert.equal(validation.valid, true);

  const activateResult = await activateAccount(db, {
    token: rawToken,
    newPassword: "novaSenha123",
    confirmPassword: "novaSenha123",
  });

  assert.equal(activateResult.message, "Conta ativada com sucesso.");

  const [userRows] = await db.promise().query(`SELECT status FROM users WHERE id = ?`, [userId]);
  assert.equal(userRows[0].status, "active");

  const loginResult = await login(db, { email, password: "novaSenha123" });
  assert.equal(loginResult.profile.status, "active");

  await assert.rejects(
    () =>
      activateAccount(db, {
        token: rawToken,
        newPassword: "outraSenha123",
        confirmPassword: "outraSenha123",
      }),
    /inválido ou expirado/
  );
});

test("cancelar um contrato pending_payment cancela a fatura de ativacao e nunca gera matricula", async () => {
  const email = testEmail("cancel");

  const result = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: {
        name: "Aluno Teste Cancelamento",
        email,
        birth_date: "2000-05-01",
        cpf: testCpf(4),
        phone: "11999990004",
      },
      contractingPartyMode: "self",
      courseId,
      pricingPlanId: planId,
      billingData: { dueDate: "2026-12-01" },
    },
    adminUserId
  );

  await cancelFinancialContract(db, result.contractId, {
    reason: "Teste automatizado",
    actorUserId: adminUserId,
  });

  const [contractRows] = await db
    .promise()
    .query(`SELECT status, enrollment_id FROM financial_contracts WHERE id = ?`, [result.contractId]);

  assert.equal(contractRows[0].status, "cancelled");
  assert.equal(contractRows[0].enrollment_id, null);

  const [invoiceRows] = await db.promise().query(`SELECT status FROM invoices WHERE id = ?`, [
    result.invoiceId,
  ]);

  assert.equal(invoiceRows[0].status, "cancelled");

  await assert.rejects(
    () =>
      registerManualPayment(db, {
        invoiceId: result.invoiceId,
        amount: 500,
        paymentMethod: "pix",
        paymentDate: new Date().toISOString(),
        reason: "Nao deveria funcionar",
        actorUserId: adminUserId,
      }),
    /cancelada/
  );

  const [enrollmentCountRows] = await db
    .promise()
    .query(`SELECT COUNT(*) AS total FROM enrollments WHERE student_id = ? AND course_id = ?`, [
      result.studentId,
      courseId,
    ]);

  assert.equal(Number(enrollmentCountRows[0].total), 0);
});

// -----------------------------------------------------------------
// invoiceAmountService.changeInvoiceAmount: ownership/curso direto de
// financial_contracts, nunca dependente de enrollments -- um contrato
// de checkout tem enrollment_id = NULL desde a criacao ate a ativacao
// (ver contractCreationService.js#createStudentContractWithInitialInvoice,
// INSERT com enrollment_id = NULL)
// -----------------------------------------------------------------

test("changeInvoiceAmount localiza e altera a fatura mesmo quando o contrato ainda nao tem matricula (enrollment_id NULL)", async () => {
  const email = testEmail("amount-no-enrollment");

  const result = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: {
        name: "Aluno Teste Valor Sem Matricula",
        email,
        birth_date: "2000-05-01",
        cpf: testCpf(5),
        phone: "11999990005",
      },
      contractingPartyMode: "self",
      courseId,
      pricingPlanId: planId,
      billingData: { dueDate: "2026-12-01" },
    },
    adminUserId
  );

  const [[contractRow]] = await db
    .promise()
    .query(`SELECT enrollment_id FROM financial_contracts WHERE id = ?`, [result.contractId]);

  assert.equal(contractRow.enrollment_id, null);

  const changeResult = await changeInvoiceAmount(db, {
    invoiceId: result.invoiceId,
    newAmount: 650,
    reason: "Ajuste de valor antes da ativacao (sem matricula ainda)",
    actorUserId: adminUserId,
  });

  assert.equal(changeResult.newAmount, 650);

  const [[invoiceRow]] = await db.promise().query(`SELECT amount FROM invoices WHERE id = ?`, [
    result.invoiceId,
  ]);

  assert.equal(Number(invoiceRow.amount), 650);
});

test("changeInvoiceAmount continua funcionando normalmente para um contrato que ja tem matricula", async () => {
  const email = testEmail("amount-with-enrollment");

  const result = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: {
        name: "Aluno Teste Valor Com Matricula",
        email,
        birth_date: "2000-05-01",
        cpf: testCpf(6),
        phone: "11999990006",
      },
      contractingPartyMode: "self",
      courseId,
      pricingPlanId: planId,
      billingData: { dueDate: "2026-12-01" },
    },
    adminUserId
  );

  await registerManualPayment(db, {
    invoiceId: result.invoiceId,
    amount: 500,
    paymentMethod: "pix",
    paymentDate: new Date().toISOString(),
    reason: "Ativacao para teste de alteracao de valor",
    actorUserId: adminUserId,
  });

  const [[contractRow]] = await db
    .promise()
    .query(`SELECT enrollment_id FROM financial_contracts WHERE id = ?`, [result.contractId]);

  assert.ok(contractRow.enrollment_id);

  const [secondInvoiceResult] = await db.promise().query(
    `
      INSERT INTO invoices (financial_contract_id, invoice_type, installment_number, description, amount, due_date, status, created_at, updated_at)
      VALUES (?, 'monthly_payment', 2, 'Segunda parcela - teste alteracao de valor', 500, DATE_ADD(CURDATE(), INTERVAL 30 DAY), 'pending', NOW(), NOW())
    `,
    [result.contractId]
  );

  const secondInvoiceId = secondInvoiceResult.insertId;

  const changeResult = await changeInvoiceAmount(db, {
    invoiceId: secondInvoiceId,
    newAmount: 480,
    reason: "Desconto aplicado apos matricula ativa",
    actorUserId: adminUserId,
  });

  assert.equal(changeResult.newAmount, 480);

  const [[invoiceRow]] = await db.promise().query(`SELECT amount FROM invoices WHERE id = ?`, [
    secondInvoiceId,
  ]);

  assert.equal(Number(invoiceRow.amount), 480);
});

// -----------------------------------------------------------------
// paymentService.registerManualPayment: contrato reason/metodo entre
// frontend e backend, metodos administrativos ampliados, regra de
// pagamento integral preservada
// -----------------------------------------------------------------

test("registerManualPayment exige reason -- sem ele, erro de validacao e nenhum payment e criado", async () => {
  const email = testEmail("manual-payment-no-reason");

  const result = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: {
        name: "Aluno Teste Sem Motivo",
        email,
        birth_date: "2000-05-01",
        cpf: testCpf(7),
        phone: "11999990007",
      },
      contractingPartyMode: "self",
      courseId,
      pricingPlanId: planId,
      billingData: { dueDate: "2026-12-01" },
    },
    adminUserId
  );

  await assert.rejects(
    () =>
      registerManualPayment(db, {
        invoiceId: result.invoiceId,
        amount: 500,
        paymentMethod: "pix",
        paymentDate: new Date().toISOString(),
        reason: "",
        actorUserId: adminUserId,
      }),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    }
  );

  const [paymentRows] = await db.promise().query(`SELECT id FROM payments WHERE invoice_id = ?`, [
    result.invoiceId,
  ]);

  assert.equal(paymentRows.length, 0);
});

test("registerManualPayment aceita os metodos administrativos ampliados (cash, bank_transfer, other) e rejeita um metodo invalido", async () => {
  const methodsToAccept = ["cash", "bank_transfer", "other"];

  for (const [index, method] of methodsToAccept.entries()) {
    const email = testEmail(`manual-payment-method-${method}`);

    const result = await createStudentContractWithInitialInvoice(
      db,
      {
        newStudentData: {
          name: `Aluno Teste Metodo ${method}`,
          email,
          birth_date: "2000-05-01",
          cpf: testCpf(20 + index),
          phone: `1199999${20 + index}`,
        },
        contractingPartyMode: "self",
        courseId,
        pricingPlanId: planId,
        billingData: { dueDate: "2026-12-01" },
      },
      adminUserId
    );

    const paymentResult = await registerManualPayment(db, {
      invoiceId: result.invoiceId,
      amount: 500,
      paymentMethod: method,
      paymentDate: new Date().toISOString(),
      reason: `Pagamento registrado via ${method}`,
      actorUserId: adminUserId,
    });

    assert.equal(paymentResult.paymentStatus, "approved");

    const [[paymentRow]] = await db.promise().query(`SELECT payment_method FROM payments WHERE id = ?`, [
      paymentResult.paymentId,
    ]);

    assert.equal(paymentRow.payment_method, method);
  }

  const invalidMethodResult = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: {
        name: "Aluno Teste Metodo Invalido",
        email: testEmail("manual-payment-invalid-method"),
        birth_date: "2000-05-01",
        cpf: testCpf(30),
        phone: "11999990030",
      },
      contractingPartyMode: "self",
      courseId,
      pricingPlanId: planId,
      billingData: { dueDate: "2026-12-01" },
    },
    adminUserId
  );

  await assert.rejects(
    () =>
      registerManualPayment(db, {
        invoiceId: invalidMethodResult.invoiceId,
        amount: 500,
        paymentMethod: "wire_fraud",
        paymentDate: new Date().toISOString(),
        reason: "Nao deveria funcionar",
        actorUserId: adminUserId,
      }),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    }
  );
});

test("registerManualPayment continua exigindo o valor integral da fatura -- valor diferente e rejeitado", async () => {
  const result = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: {
        name: "Aluno Teste Valor Parcial",
        email: testEmail("manual-payment-partial-amount"),
        birth_date: "2000-05-01",
        cpf: testCpf(31),
        phone: "11999990031",
      },
      contractingPartyMode: "self",
      courseId,
      pricingPlanId: planId,
      billingData: { dueDate: "2026-12-01" },
    },
    adminUserId
  );

  await assert.rejects(
    () =>
      registerManualPayment(db, {
        invoiceId: result.invoiceId,
        amount: 250,
        paymentMethod: "pix",
        paymentDate: new Date().toISOString(),
        reason: "Pagamento parcial nao deveria ser aceito",
        actorUserId: adminUserId,
      }),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    }
  );

  const [paymentRows] = await db.promise().query(`SELECT id FROM payments WHERE invoice_id = ?`, [
    result.invoiceId,
  ]);

  assert.equal(paymentRows.length, 0);
});

test("contractingPartyService: rejeita CPF invalido ao criar contratante terceiro", async () => {
  await assert.rejects(
    () =>
      createContractingParty(db, {
        party_type: "individual",
        name: "Contratante CPF Invalido",
        document_type: "cpf",
        document_number: "111.111.111-11",
        email: testEmail("invalid-cpf"),
      }),
    /CPF inválido/
  );
});

test("contractingPartyService: cria contratante terceiro valido e rejeita documento duplicado", async () => {
  const party = await createContractingParty(db, {
    party_type: "individual",
    name: "Contratante Valido",
    document_type: "cpf",
    document_number: "529.982.247-25",
    email: testEmail("valid-party"),
  });

  assert.ok(party.id);
  assert.equal(party.documentNumber, "52998224725");

  await assert.rejects(
    () =>
      createContractingParty(db, {
        party_type: "individual",
        name: "Contratante Duplicado",
        document_type: "cpf",
        document_number: "529.982.247-25",
        email: testEmail("valid-party-dup"),
      }),
    /já existe/i
  );

  await db.promise().query(`DELETE FROM contracting_parties WHERE id = ?`, [party.id]);
});
