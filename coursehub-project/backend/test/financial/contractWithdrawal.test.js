const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();
require("../../services/notifications/eventDefinitions");

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");
const authorizeRoles = require("../../middlewares/authorizeRoles");

const {
  createStudentContractWithInitialInvoice,
} = require("../../services/financial/contractCreationService");
const { registerManualPayment } = require("../../services/financial/paymentService");
const { refundPayment } = require("../../services/financial/paymentRefundService");
const { createInvoicePayment } = require("../../services/financial/studentPaymentService");
const { processGatewayPaymentUpdate } = require("../../services/financial/paymentProcessingService");
const simulatedGateway = require("../../services/paymentGateway/simulatedGateway");

const {
  getContractWithdrawalImpact,
  registerContractWithdrawal,
} = require("../../services/financial/contractWithdrawalService");
const { getActiveEnrollmentForStudent } = require("../../services/classes/classAccessService");

const COURSE_NAME = "TEST CONTRACT WITHDRAWAL COURSE";
const RUN_ID = Date.now();

let courseId;
let planId;
let adminUserId;

let invoiceSequence = 0;
let studentSequence = 0;

function calculateCpfCheckDigit(digits, length) {
  let sum = 0;

  for (let i = 0; i < length; i += 1) {
    sum += digits[i] * (length + 1 - i);
  }

  const remainder = (sum * 10) % 11;

  return remainder === 10 ? 0 : remainder;
}

function testCpf(sequence) {
  const raw = (String(RUN_ID).slice(-5) + String(sequence).padStart(4, "0")).slice(0, 9);
  const baseDigits = raw.split("").map(Number);

  const d1 = calculateCpfCheckDigit(baseDigits, 9);
  const withD1 = [...baseDigits, d1];
  const d2 = calculateCpfCheckDigit(withD1, 10);

  return [...withD1, d2].join("");
}

function testEmail(label) {
  return `contract.withdrawal.${RUN_ID}.${label}@example.com`;
}

async function purgeCourseData(targetCourseId) {
  const [contracts] = await db
    .promise()
    .query(`SELECT id, enrollment_id, student_id FROM financial_contracts WHERE course_id = ?`, [targetCourseId]);

  for (const contract of contracts) {
    // Mesma ordem defensiva documentada na memória do projeto: fecha o
    // status ANTES de tocar em qualquer FK (evita que o worker de
    // lembretes reinsira invoice_collection_actions entre os deletes),
    // depois invoice_collection_actions -> financial_events/payment_events
    // -> payments -> invoices -> financial_contracts -> enrollments.
    await db
      .promise()
      .query(`UPDATE invoices SET status = 'cancelled' WHERE financial_contract_id = ?`, [contract.id]);

    await db
      .promise()
      .query(
        `DELETE ica FROM invoice_collection_actions ica INNER JOIN invoices i ON i.id = ica.invoice_id WHERE i.financial_contract_id = ?`,
        [contract.id]
      );

    await db
      .promise()
      .query(
        `DELETE t FROM invoice_payment_access_tokens t INNER JOIN invoices i ON i.id = t.invoice_id WHERE i.financial_contract_id = ?`,
        [contract.id]
      );

    await db
      .promise()
      .query(
        `DELETE s FROM invoice_payment_sessions s INNER JOIN invoices i ON i.id = s.invoice_id WHERE i.financial_contract_id = ?`,
        [contract.id]
      );

    // Alguns eventos (ex.: account_activation_invitation_created,
    // disparado por dispatchActivationNotifications após a ativação)
    // são ancorados SÓ em enrollment_id, com financial_contract_id
    // NULL -- por isso o delete cobre os dois anchors, não só o do
    // contrato.
    await db
      .promise()
      .query(`DELETE FROM financial_events WHERE financial_contract_id = ? OR enrollment_id = ?`, [
        contract.id,
        contract.enrollment_id,
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

    await db.promise().query(`DELETE FROM student_content_progress WHERE course_id = ?`, [targetCourseId]);

    await db
      .promise()
      .query(`UPDATE financial_contracts SET activation_invoice_id = NULL, enrollment_id = NULL WHERE id = ?`, [
        contract.id,
      ]);

    await db.promise().query(`DELETE FROM invoices WHERE financial_contract_id = ?`, [contract.id]);
  }

  await db.promise().query(`DELETE FROM enrollments WHERE course_id = ?`, [targetCourseId]);
  await db.promise().query(`DELETE FROM financial_contracts WHERE course_id = ?`, [targetCourseId]);

  const studentIds = [...new Set(contracts.map((row) => row.student_id).filter(Boolean))];

  for (const studentId of studentIds) {
    const [studentRows] = await db.promise().query(`SELECT user_id FROM students WHERE id = ?`, [studentId]);

    if (studentRows.length === 0) continue;

    const userId = studentRows[0].user_id;

    await db.promise().query(`DELETE FROM student_contracting_parties WHERE student_id = ?`, [studentId]);
    await db.promise().query(`DELETE FROM contracting_parties WHERE user_id = ?`, [userId]);
    await db.promise().query(`DELETE FROM account_activation_tokens WHERE user_id = ?`, [userId]);
    await db.promise().query(`DELETE FROM students WHERE id = ?`, [studentId]);
    await db.promise().query(`DELETE FROM users WHERE id = ?`, [userId]);
  }

  await db.promise().query(`DELETE FROM course_contents WHERE course_id = ?`, [targetCourseId]);
  await db.promise().query(`DELETE FROM course_pricing_plans WHERE course_id = ?`, [targetCourseId]);
  await db.promise().query(`DELETE FROM courses WHERE id = ?`, [targetCourseId]);
}

before(async () => {
  const [staleCourses] = await db.promise().query(`SELECT id FROM courses WHERE name = ?`, [COURSE_NAME]);
  for (const course of staleCourses) {
    await purgeCourseData(course.id);
  }

  const [adminRows] = await db.promise().query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
  adminUserId = adminRows[0].id;

  const [courseResult] = await db.promise().query(
    `
      INSERT INTO courses (teacher_id, name, description, workload_hours, price, status, nivel, created_at, updated_at)
      VALUES (NULL, ?, 'Curso de teste (desistencia)', 10, 0, 'draft', 'Iniciante', NOW(), NOW())
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
});

after(async () => {
  await retryOnDeadlock(() => purgeCourseData(courseId));
  await db.promise().end();
});

/**
 * Cria um contrato ATIVO de verdade (matrícula já criada), passando
 * pelo mesmo caminho de produção usado em contractingFlow.test.js:
 * contrato pending_payment -> primeira fatura paga -> ativação. Cada
 * chamada usa um aluno novo (nunca reaproveita fixture entre testes,
 * para nenhum teste interferir no outro).
 */
async function createActiveContractFixture() {
  studentSequence += 1;
  const sequence = studentSequence;

  const result = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: {
        name: `Aluno Teste Desistencia ${sequence}`,
        email: testEmail(`student-${sequence}`),
        birth_date: "2000-05-01",
        cpf: testCpf(sequence),
        phone: "11999990000",
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
    amount: 400,
    paymentMethod: "pix",
    paymentDate: new Date().toISOString(),
    reason: "Teste automatizado (fixture)",
    actorUserId: adminUserId,
  });

  const [studentRows] = await db.promise().query(`SELECT user_id FROM students WHERE id = ?`, [result.studentId]);

  return {
    contractId: result.contractId,
    enrollmentId: paymentResult.activationResult.enrollmentId,
    studentId: result.studentId,
    studentUserId: studentRows[0].user_id,
    activationInvoiceId: result.invoiceId,
  };
}

async function addInvoice(contractId, { amount, status, dueDate }) {
  invoiceSequence += 1;

  const [result] = await db.promise().query(
    `
      INSERT INTO invoices
        (financial_contract_id, invoice_type, installment_number, description, amount, due_date, status, created_at, updated_at)
      VALUES (?, 'monthly_payment', ?, ?, ?, ?, ?, NOW(), NOW())
    `,
    [contractId, invoiceSequence + 1, `TEST WITHDRAWAL invoice ${invoiceSequence}`, amount, dueDate, status]
  );

  return result.insertId;
}

async function countFinancialEvents(eventType, contractId) {
  const [rows] = await db
    .promise()
    .query(`SELECT COUNT(*) AS total FROM financial_events WHERE event_type = ? AND financial_contract_id = ?`, [
      eventType,
      contractId,
    ]);

  return Number(rows[0].total);
}

test("autorização: authorizeRoles(admin) recusa quem não é admin e quem não está autenticado", () => {
  const middleware = authorizeRoles("admin");

  let statusCode = null;
  let nextCalled = false;

  function buildRes() {
    return {
      status(code) {
        statusCode = code;
        return this;
      },
      json() {
        return this;
      },
    };
  }

  middleware({}, buildRes(), () => {
    nextCalled = true;
  });
  assert.equal(statusCode, 401);
  assert.equal(nextCalled, false);

  statusCode = null;
  middleware({ auth: { userId: 1, role: "teacher" } }, buildRes(), () => {
    nextCalled = true;
  });
  assert.equal(statusCode, 403);
  assert.equal(nextCalled, false);

  nextCalled = false;
  middleware({ auth: { userId: adminUserId, role: "admin" } }, buildRes(), () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});

test("registerContractWithdrawal: motivo é obrigatório", async () => {
  const fixture = await createActiveContractFixture();

  await assert.rejects(
    () =>
      registerContractWithdrawal(db, fixture.contractId, {
        reason: "   ",
        overdueInvoiceAction: "keep",
        actorUserId: adminUserId,
      }),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    }
  );
});

test("registerContractWithdrawal: ação de fatura vencida inválida retorna 400", async () => {
  const fixture = await createActiveContractFixture();

  await assert.rejects(
    () =>
      registerContractWithdrawal(db, fixture.contractId, {
        reason: "Teste automatizado",
        overdueInvoiceAction: "delete_everything",
        actorUserId: adminUserId,
      }),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    }
  );
});

test("registerContractWithdrawal: contrato inexistente retorna 404", async () => {
  await assert.rejects(
    () =>
      registerContractWithdrawal(db, 999999999, {
        reason: "Teste automatizado",
        overdueInvoiceAction: "keep",
        actorUserId: adminUserId,
      }),
    (error) => {
      assert.equal(error.statusCode, 404);
      return true;
    }
  );
});

test("registerContractWithdrawal: contrato pending_payment é recusado e orienta usar o cancelamento comum", async () => {
  studentSequence += 1;
  const sequence = studentSequence;

  const result = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: {
        name: `Aluno Teste Pending ${sequence}`,
        email: testEmail(`pending-${sequence}`),
        birth_date: "2000-05-01",
        cpf: testCpf(sequence),
        phone: "11999990000",
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
      registerContractWithdrawal(db, result.contractId, {
        reason: "Teste automatizado",
        overdueInvoiceAction: "keep",
        actorUserId: adminUserId,
      }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /cancelamento de contrata/i);
      return true;
    }
  );

  const [contractRows] = await db
    .promise()
    .query(`SELECT status FROM financial_contracts WHERE id = ?`, [result.contractId]);
  assert.equal(contractRows[0].status, "pending_payment");
});

test("registerContractWithdrawal: contrato completed é recusado", async () => {
  const fixture = await createActiveContractFixture();

  await db.promise().query(`UPDATE financial_contracts SET status = 'completed' WHERE id = ?`, [fixture.contractId]);

  await assert.rejects(
    () =>
      registerContractWithdrawal(db, fixture.contractId, {
        reason: "Teste automatizado",
        overdueInvoiceAction: "keep",
        actorUserId: adminUserId,
      }),
    (error) => {
      assert.equal(error.statusCode, 409);
      return true;
    }
  );
});

test("registerContractWithdrawal: matrícula já concluída é tratada como conflito", async () => {
  const fixture = await createActiveContractFixture();

  await db.promise().query(`UPDATE enrollments SET status = 'completed' WHERE id = ?`, [fixture.enrollmentId]);

  await assert.rejects(
    () =>
      registerContractWithdrawal(db, fixture.contractId, {
        reason: "Teste automatizado",
        overdueInvoiceAction: "keep",
        actorUserId: adminUserId,
      }),
    (error) => {
      assert.equal(error.statusCode, 409);
      return true;
    }
  );

  const [contractRows] = await db
    .promise()
    .query(`SELECT status FROM financial_contracts WHERE id = ?`, [fixture.contractId]);
  // Nada foi mutado -- a checagem da matrícula falhou antes de
  // qualquer UPDATE em financial_contracts.
  assert.equal(contractRows[0].status, "active");
});

test("registerContractWithdrawal: contrato active permite desistência, cancela contrato+matrícula, preserva progresso acadêmico e não duplica em chamada repetida", async () => {
  const fixture = await createActiveContractFixture();

  const [contentResult] = await db.promise().query(
    `
      INSERT INTO course_contents
        (course_id, class_id, title, description, type, content_url, content_text, order_index, is_required, status, due_date, created_at, updated_at)
      VALUES (?, NULL, 'Conteudo de teste', NULL, 'text', NULL, 'Texto de teste', 1, 1, 'active', NULL, NOW(), NOW())
    `,
    [courseId]
  );
  const contentId = contentResult.insertId;

  await db.promise().query(
    `
      INSERT INTO student_content_progress
        (student_id, course_id, content_id, status, progress_percentage, last_position_seconds, started_at, completed_at, last_accessed_at, created_at, updated_at)
      VALUES (?, ?, ?, 'completed', 100, NULL, NOW(), NOW(), NOW(), NOW(), NOW())
    `,
    [fixture.studentId, courseId, contentId]
  );

  const result = await registerContractWithdrawal(db, fixture.contractId, {
    reason: "Aluno solicitou o encerramento do curso.",
    notes: "Solicitação recebida por e-mail.",
    overdueInvoiceAction: "keep",
    actorUserId: adminUserId,
  });

  assert.equal(result.status, "cancelled");
  assert.equal(result.cancellationReason, "student_withdrawal");
  assert.equal(result.enrollmentStatus, "withdrawn");
  assert.equal(result.enrollmentId, fixture.enrollmentId);

  const [contractRows] = await db
    .promise()
    .query(`SELECT status, cancelled_at, cancellation_reason FROM financial_contracts WHERE id = ?`, [
      fixture.contractId,
    ]);
  assert.equal(contractRows[0].status, "cancelled");
  assert.ok(contractRows[0].cancelled_at, "cancelled_at deveria ter sido preenchido");
  assert.equal(contractRows[0].cancellation_reason, "student_withdrawal");

  const [enrollmentRows] = await db
    .promise()
    .query(`SELECT status FROM enrollments WHERE id = ?`, [fixture.enrollmentId]);
  assert.equal(enrollmentRows[0].status, "withdrawn");

  // Fatura de ativação, já paga, permanece paga -- nunca tocada.
  const [invoiceRows] = await db
    .promise()
    .query(`SELECT status FROM invoices WHERE id = ?`, [fixture.activationInvoiceId]);
  assert.equal(invoiceRows[0].status, "paid");

  // Progresso acadêmico preservado.
  const [progressRows] = await db
    .promise()
    .query(`SELECT status, progress_percentage FROM student_content_progress WHERE student_id = ? AND content_id = ?`, [
      fixture.studentId,
      contentId,
    ]);
  assert.equal(progressRows.length, 1);
  assert.equal(progressRows[0].status, "completed");
  assert.equal(Number(progressRows[0].progress_percentage), 100);

  assert.equal(await countFinancialEvents("contract_withdrawal_registered", fixture.contractId), 1);

  // Chamada repetida: conflito coerente, sem duplicar o evento.
  await assert.rejects(
    () =>
      registerContractWithdrawal(db, fixture.contractId, {
        reason: "Segunda tentativa",
        overdueInvoiceAction: "keep",
        actorUserId: adminUserId,
      }),
    (error) => {
      assert.equal(error.statusCode, 409);
      return true;
    }
  );

  assert.equal(await countFinancialEvents("contract_withdrawal_registered", fixture.contractId), 1);
});

test("registerContractWithdrawal: matrícula withdrawn perde acesso acadêmico pelo mesmo gate já usado pelo checkout/CoursePlayer", async () => {
  const fixture = await createActiveContractFixture();

  // Antes da desistência, o gate de acesso (o mesmo usado por "Meus
  // cursos"/CoursePlayer/atividades) enxerga a matrícula normalmente.
  const beforeWithdrawal = await getActiveEnrollmentForStudent(db.promise(), {
    studentId: fixture.studentId,
    courseId,
  });
  assert.ok(beforeWithdrawal, "matrícula deveria estar ativa antes da desistência");
  assert.equal(beforeWithdrawal.id, fixture.enrollmentId);

  await registerContractWithdrawal(db, fixture.contractId, {
    reason: "Teste automatizado (perda de acesso)",
    overdueInvoiceAction: "keep",
    actorUserId: adminUserId,
  });

  // getActiveEnrollmentForStudent só exige status = 'active' -- nenhuma
  // query nova foi necessária para isso, 'withdrawn' já cai fora
  // naturalmente.
  const afterWithdrawal = await getActiveEnrollmentForStudent(db.promise(), {
    studentId: fixture.studentId,
    courseId,
  });
  assert.equal(afterWithdrawal, null, "matrícula withdrawn não deveria conceder acesso ativo ao curso");
});

test("registerContractWithdrawal: contrato ativo excepcionalmente sem matrícula vinculada é recusado, sem inventar matrícula e sem cancelar o contrato sozinho", async () => {
  const fixture = await createActiveContractFixture();

  // Cenário excepcional documentado no código (não alcançável pelo
  // fluxo normal de produção, já que activateContractFromPaidInvoice
  // sempre define enrollment_id no mesmo passo que ativa o contrato)
  // -- forçado aqui via SQL direto para exercitar a guarda defensiva.
  await db.promise().query(`UPDATE financial_contracts SET enrollment_id = NULL WHERE id = ?`, [
    fixture.contractId,
  ]);

  await assert.rejects(
    () =>
      registerContractWithdrawal(db, fixture.contractId, {
        reason: "Não deveria funcionar",
        overdueInvoiceAction: "keep",
        actorUserId: adminUserId,
      }),
    (error) => {
      assert.equal(error.statusCode, 409);
      assert.match(error.message, /não possui matrícula vinculada/);
      return true;
    }
  );

  // Nem o contrato nem a matrícula (ainda ativa, só desvinculada) foram
  // tocados -- a operação falhou por inteiro, não parcialmente.
  const [contractRows] = await db
    .promise()
    .query(`SELECT status, cancellation_reason FROM financial_contracts WHERE id = ?`, [fixture.contractId]);
  assert.equal(contractRows[0].status, "active");
  assert.equal(contractRows[0].cancellation_reason, null);

  const [enrollmentRows] = await db.promise().query(`SELECT status FROM enrollments WHERE id = ?`, [
    fixture.enrollmentId,
  ]);
  assert.equal(enrollmentRows[0].status, "active");

  assert.equal(await countFinancialEvents("contract_withdrawal_registered", fixture.contractId), 0);

  // Restaura o vínculo para o cleanup padrão do arquivo conseguir
  // encontrar/apagar esta matrícula normalmente.
  await db.promise().query(`UPDATE financial_contracts SET enrollment_id = ? WHERE id = ?`, [
    fixture.enrollmentId,
    fixture.contractId,
  ]);
});

test("registerContractWithdrawal: contrato overdue permite desistência", async () => {
  const fixture = await createActiveContractFixture();

  await addInvoice(fixture.contractId, { amount: 100, status: "overdue", dueDate: "2026-01-01" });
  await db.promise().query(`UPDATE financial_contracts SET status = 'overdue' WHERE id = ?`, [fixture.contractId]);

  const result = await registerContractWithdrawal(db, fixture.contractId, {
    reason: "Teste automatizado",
    overdueInvoiceAction: "keep",
    actorUserId: adminUserId,
  });

  assert.equal(result.status, "cancelled");
});

test("registerContractWithdrawal: fatura futura aberta é cancelada e remove ações de cobrança pendentes; fatura vencida é preservada com overdueInvoiceAction=keep", async () => {
  const fixture = await createActiveContractFixture();

  const openInvoiceId = await addInvoice(fixture.contractId, {
    amount: 150,
    status: "pending",
    dueDate: "2027-01-01",
  });

  const overdueInvoiceId = await addInvoice(fixture.contractId, {
    amount: 90,
    status: "overdue",
    dueDate: "2026-01-01",
  });

  await db.promise().query(`UPDATE financial_contracts SET status = 'overdue' WHERE id = ?`, [fixture.contractId]);

  await db.promise().query(
    `INSERT INTO invoice_collection_actions (invoice_id, action_type, status, scheduled_for, created_at) VALUES (?, 'due_date_notice', 'pending', CURDATE(), NOW())`,
    [openInvoiceId]
  );

  const result = await registerContractWithdrawal(db, fixture.contractId, {
    reason: "Teste automatizado",
    overdueInvoiceAction: "keep",
    actorUserId: adminUserId,
  });

  assert.ok(result.cancelledInvoiceIds.includes(openInvoiceId));
  assert.ok(!result.cancelledInvoiceIds.includes(overdueInvoiceId));

  const [openInvoiceRows] = await db.promise().query(`SELECT status FROM invoices WHERE id = ?`, [openInvoiceId]);
  assert.equal(openInvoiceRows[0].status, "cancelled");

  const [overdueInvoiceRows] = await db
    .promise()
    .query(`SELECT status FROM invoices WHERE id = ?`, [overdueInvoiceId]);
  assert.equal(overdueInvoiceRows[0].status, "overdue");

  const [collectionActionRows] = await db
    .promise()
    .query(`SELECT COUNT(*) AS total FROM invoice_collection_actions WHERE invoice_id = ? AND status = 'pending'`, [
      openInvoiceId,
    ]);
  assert.equal(Number(collectionActionRows[0].total), 0);
});

test("registerContractWithdrawal: overdueInvoiceAction=cancel cancela a fatura vencida", async () => {
  const fixture = await createActiveContractFixture();

  const overdueInvoiceId = await addInvoice(fixture.contractId, {
    amount: 90,
    status: "overdue",
    dueDate: "2026-01-01",
  });

  await db.promise().query(`UPDATE financial_contracts SET status = 'overdue' WHERE id = ?`, [fixture.contractId]);

  const result = await registerContractWithdrawal(db, fixture.contractId, {
    reason: "Teste automatizado",
    overdueInvoiceAction: "cancel",
    actorUserId: adminUserId,
  });

  assert.ok(result.cancelledInvoiceIds.includes(overdueInvoiceId));

  const [overdueInvoiceRows] = await db
    .promise()
    .query(`SELECT status FROM invoices WHERE id = ?`, [overdueInvoiceId]);
  assert.equal(overdueInvoiceRows[0].status, "cancelled");
});

test("registerContractWithdrawal: fatura reembolsada permanece refunded e nenhum reembolso é criado automaticamente", async () => {
  const fixture = await createActiveContractFixture();

  const refundableInvoiceId = await addInvoice(fixture.contractId, {
    amount: 120,
    status: "pending",
    dueDate: "2025-06-01",
  });

  // Uma fatura futura em aberto mantém o contrato em 'active' depois
  // do reembolso -- sem ela, recalculateFinancialContractStatus (chamado
  // pelo pagamento/reembolso) veria todas as faturas fechadas e
  // mudaria o contrato para 'completed', que legitimamente não
  // permite desistência (isso não é o que este teste quer exercitar).
  await addInvoice(fixture.contractId, {
    amount: 130,
    status: "pending",
    dueDate: "2027-03-01",
  });

  const paidResult = await registerManualPayment(db, {
    invoiceId: refundableInvoiceId,
    amount: 120,
    paymentMethod: "pix",
    paymentDate: new Date().toISOString(),
    reason: "Teste automatizado (fixture)",
    actorUserId: adminUserId,
  });

  await refundPayment(db, {
    paymentId: paidResult.paymentId,
    reason: "Teste automatizado (fixture)",
    actorUserId: adminUserId,
  });

  const [beforeInvoiceRows] = await db
    .promise()
    .query(`SELECT status FROM invoices WHERE id = ?`, [refundableInvoiceId]);
  assert.equal(beforeInvoiceRows[0].status, "refunded");

  const [beforePaymentCountRows] = await db
    .promise()
    .query(`SELECT COUNT(*) AS total FROM payments WHERE invoice_id = ?`, [refundableInvoiceId]);

  await registerContractWithdrawal(db, fixture.contractId, {
    reason: "Teste automatizado",
    overdueInvoiceAction: "keep",
    actorUserId: adminUserId,
  });

  const [afterInvoiceRows] = await db
    .promise()
    .query(`SELECT status FROM invoices WHERE id = ?`, [refundableInvoiceId]);
  assert.equal(afterInvoiceRows[0].status, "refunded");

  const [afterPaymentCountRows] = await db
    .promise()
    .query(`SELECT COUNT(*) AS total FROM payments WHERE invoice_id = ?`, [refundableInvoiceId]);

  // A desistência nunca insere um novo pagamento/reembolso.
  assert.equal(Number(afterPaymentCountRows[0].total), Number(beforePaymentCountRows[0].total));
});

test("getContractWithdrawalImpact: valores financeiros corretos e isWithdrawalAllowed coerente", async () => {
  const fixture = await createActiveContractFixture();

  await addInvoice(fixture.contractId, { amount: 150, status: "pending", dueDate: "2027-01-01" });
  await addInvoice(fixture.contractId, { amount: 90, status: "overdue", dueDate: "2026-01-01" });
  await db.promise().query(`UPDATE financial_contracts SET status = 'overdue' WHERE id = ?`, [fixture.contractId]);

  const impact = await getContractWithdrawalImpact(db, fixture.contractId);

  assert.equal(impact.contract.status, "overdue");
  assert.equal(impact.enrollment.id, fixture.enrollmentId);
  assert.equal(impact.enrollment.status, "active");
  assert.ok(impact.student?.name);
  assert.ok(impact.course?.name);
  assert.ok(impact.contractingParty?.name);

  assert.equal(impact.totals.paidAmount, 400);
  assert.equal(impact.totals.paidCount, 1);
  assert.equal(impact.totals.openAmount, 150);
  assert.equal(impact.totals.openCount, 1);
  assert.equal(impact.totals.overdueAmount, 90);
  assert.equal(impact.totals.overdueCount, 1);

  assert.equal(impact.isWithdrawalAllowed, true);
  assert.deepEqual(impact.blockers, []);
});

test("getContractWithdrawalImpact: contrato pending_payment não é permitido, com bloqueador explicando o motivo", async () => {
  studentSequence += 1;
  const sequence = studentSequence;

  const result = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: {
        name: `Aluno Teste Impact Pending ${sequence}`,
        email: testEmail(`impact-pending-${sequence}`),
        birth_date: "2000-05-01",
        cpf: testCpf(sequence),
        phone: "11999990000",
      },
      contractingPartyMode: "self",
      courseId,
      pricingPlanId: planId,
      billingData: { dueDate: "2026-12-01" },
    },
    adminUserId
  );

  const impact = await getContractWithdrawalImpact(db, result.contractId);

  assert.equal(impact.isWithdrawalAllowed, false);
  // Um contrato pending_payment também nunca tem matrícula ainda, o
  // que soma um segundo bloqueador explicando exatamente isso -- o
  // importante é que o motivo "use o cancelamento comum" esteja entre
  // eles, não que seja o único.
  assert.ok(impact.blockers.length >= 1);
  assert.ok(impact.blockers.some((blocker) => /cancelamento de contrata/i.test(blocker)));
});

test("concorrência: duas desistências simultâneas para o mesmo contrato -- só uma é registrada", async () => {
  const fixture = await createActiveContractFixture();

  const attempts = await Promise.allSettled([
    registerContractWithdrawal(db, fixture.contractId, {
      reason: "Tentativa concorrente A",
      overdueInvoiceAction: "keep",
      actorUserId: adminUserId,
    }),
    registerContractWithdrawal(db, fixture.contractId, {
      reason: "Tentativa concorrente B",
      overdueInvoiceAction: "keep",
      actorUserId: adminUserId,
    }),
  ]);

  const fulfilled = attempts.filter((attempt) => attempt.status === "fulfilled");
  const rejected = attempts.filter((attempt) => attempt.status === "rejected");

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.statusCode, 409);

  assert.equal(await countFinancialEvents("contract_withdrawal_registered", fixture.contractId), 1);

  const [contractRows] = await db
    .promise()
    .query(`SELECT status FROM financial_contracts WHERE id = ?`, [fixture.contractId]);
  assert.equal(contractRows[0].status, "cancelled");
});

test("webhook atrasado após a desistência: nunca reativa contrato/matrícula, nunca reabre a fatura, mas preserva o pagamento e gera evento auditável", async () => {
  const fixture = await createActiveContractFixture();

  const lateInvoiceId = await addInvoice(fixture.contractId, {
    amount: 175,
    status: "pending",
    dueDate: "2027-02-01",
  });

  const created = await createInvoicePayment(db, {
    userId: fixture.studentUserId,
    invoiceId: lateInvoiceId,
    paymentMethod: "pix",
  });

  const [[paymentRow]] = await db
    .promise()
    .query(`SELECT gateway_payment_id FROM payments WHERE id = ?`, [created.paymentId]);

  // Arma a aprovação no gateway simulado ANTES da desistência -- o
  // aluno iniciou o pagamento, mas a confirmação só chega depois.
  simulatedGateway.simulateApproval(paymentRow.gateway_payment_id);

  await registerContractWithdrawal(db, fixture.contractId, {
    reason: "Aluno desistiu antes de confirmar o pagamento",
    overdueInvoiceAction: "keep",
    actorUserId: adminUserId,
  });

  const [invoiceBeforeWebhookRows] = await db
    .promise()
    .query(`SELECT status FROM invoices WHERE id = ?`, [lateInvoiceId]);
  assert.equal(invoiceBeforeWebhookRows[0].status, "cancelled");

  // Webhook atrasado chega DEPOIS que o contrato já foi cancelado.
  const webhookResult = await processGatewayPaymentUpdate(db, {
    gateway: "simulated",
    gatewayPaymentId: paymentRow.gateway_payment_id,
    gatewayEventId: null,
    source: "simulated_gateway",
  });

  assert.equal(webhookResult.applied, true);
  assert.equal(webhookResult.reason, "invoice_already_closed");
  assert.equal(webhookResult.activationResult, undefined);

  // O dinheiro é preservado: o pagamento é marcado approved.
  const [paymentAfterRows] = await db
    .promise()
    .query(`SELECT status FROM payments WHERE id = ?`, [created.paymentId]);
  assert.equal(paymentAfterRows[0].status, "approved");

  // Mas a fatura NUNCA volta a 'paid', e o contrato/matrícula
  // continuam cancelados -- nada foi reativado.
  const [invoiceAfterWebhookRows] = await db
    .promise()
    .query(`SELECT status FROM invoices WHERE id = ?`, [lateInvoiceId]);
  assert.equal(invoiceAfterWebhookRows[0].status, "cancelled");

  const [contractAfterRows] = await db
    .promise()
    .query(`SELECT status FROM financial_contracts WHERE id = ?`, [fixture.contractId]);
  assert.equal(contractAfterRows[0].status, "cancelled");

  const [enrollmentAfterRows] = await db
    .promise()
    .query(`SELECT status FROM enrollments WHERE id = ?`, [fixture.enrollmentId]);
  assert.equal(enrollmentAfterRows[0].status, "withdrawn");

  // Nenhuma segunda matrícula foi criada para este aluno/curso.
  const [enrollmentCountRows] = await db
    .promise()
    .query(`SELECT COUNT(*) AS total FROM enrollments WHERE student_id = ? AND course_id = ?`, [
      fixture.studentId,
      courseId,
    ]);
  assert.equal(Number(enrollmentCountRows[0].total), 1);

  // O pagamento tardio ficou auditável.
  const [auditEventRows] = await db
    .promise()
    .query(
      `SELECT COUNT(*) AS total FROM financial_events WHERE event_type = 'payment_approved_after_invoice_cancelled' AND payment_id = ?`,
      [created.paymentId]
    );
  assert.equal(Number(auditEventRows[0].total), 1);
});
