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
const { evaluateEnrollmentCompletion } = require("../../services/academic/enrollmentCompletionService");
const { createRuleVersion } = require("../../services/academic/completionRuleService");

const COURSE_NAME = "TEST ENROLLMENT COMPLETION COURSE";
const RUN_ID = Date.now();

let courseId;
let planId;
let adminUserId;
let enrollmentId;
let studentId;

function testCpf(sequence) {
  const digits = String(RUN_ID).slice(-6) + String(sequence).padStart(3, "0");

  return digits.slice(0, 9).padEnd(9, "0") + "00";
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

  const [enrollments] = await db.promise().query(`SELECT id FROM enrollments WHERE course_id = ?`, [courseId]);
  for (const enrollment of enrollments) {
    await db.promise().query(`DELETE FROM financial_events WHERE enrollment_id = ?`, [enrollment.id]);
  }

  await db.promise().query(`DELETE FROM enrollments WHERE course_id = ?`, [courseId]);
  await db.promise().query(`DELETE FROM financial_contracts WHERE course_id = ?`, [courseId]);

  if (studentId) {
    const [studentRows] = await db.promise().query(`SELECT user_id FROM students WHERE id = ?`, [studentId]);
    if (studentRows.length > 0) {
      const userId = studentRows[0].user_id;
      await purgeUserAuxiliaryData(userId);
      await db.promise().query(`DELETE FROM student_contracting_parties WHERE student_id = ?`, [studentId]);
      await db.promise().query(`DELETE FROM contracting_parties WHERE user_id = ?`, [userId]);
      await db.promise().query(`DELETE FROM account_activation_tokens WHERE user_id = ?`, [userId]);
      await db.promise().query(`DELETE FROM students WHERE id = ?`, [studentId]);
      await db.promise().query(`DELETE FROM users WHERE id = ?`, [userId]);
    }
  }

  await db.promise().query(`DELETE FROM course_pricing_plans WHERE course_id = ?`, [courseId]);
  await db.promise().query(`DELETE FROM courses WHERE id = ?`, [courseId]);
}

before(async () => {
  const [courseResult] = await db.promise().query(
    `
      INSERT INTO courses (teacher_id, name, description, workload_hours, price, status, nivel, created_at, updated_at)
      VALUES (NULL, ?, 'Curso de teste (elegibilidade)', 10, 0, 'draft', 'Iniciante', NOW(), NOW())
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

  const [adminRows] = await db.promise().query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
  adminUserId = adminRows[0].id;

  const email = `enrollment.completion.${RUN_ID}@example.com`;
  const result = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: {
        name: "Aluno Teste Elegibilidade",
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
    amount: 300,
    paymentMethod: "pix",
    paymentDate: new Date().toISOString(),
    reason: "Teste automatizado",
    actorUserId: adminUserId,
  });

  enrollmentId = paymentResult.activationResult.enrollmentId;
});

after(async () => {
  await retryOnDeadlock(() => purgeCourseData());
  await db.promise().end();
});

test("sem regra de conclusão configurada, avaliação lança erro claro (não assume elegível)", async () => {
  await assert.rejects(
    () => evaluateEnrollmentCompletion(db, enrollmentId),
    (error) => {
      assert.equal(error.statusCode, 422);
      return true;
    }
  );
});

test("regra permissiva (progresso >= 0%): elegível, um único requisito avaliado", async () => {
  await createRuleVersion(db, {
    courseId,
    minContentProgressPercentage: 0,
    requireAllMandatoryItems: false,
    createdByUserId: adminUserId,
  });

  const result = await evaluateEnrollmentCompletion(db, enrollmentId);

  assert.equal(result.eligible, true);
  assert.equal(result.requirements.length, 1);
  assert.equal(result.requirements[0].key, "content_progress");
  assert.equal(result.requirements[0].met, true);
});

test("regra exigindo frequência mínima numa matrícula sem turma: requisito aparece como não cumprido (actual null), nunca ignorado", async () => {
  await createRuleVersion(db, {
    courseId,
    minAttendancePercentage: 50,
    requireAllMandatoryItems: false,
    createdByUserId: adminUserId,
  });

  const result = await evaluateEnrollmentCompletion(db, enrollmentId);

  const attendanceRequirement = result.requirements.find((requirement) => requirement.key === "attendance");

  assert.ok(attendanceRequirement, "o requisito de frequência precisa aparecer no array, mesmo sem turma");
  assert.equal(attendanceRequirement.actual, null);
  assert.equal(attendanceRequirement.met, false);
  assert.equal(result.eligible, false);
});

test("regra exigindo itens obrigatórios quando o curso não tem nenhuma atividade obrigatória: requisito não aparece (não aplicável, não é reprovação)", async () => {
  await createRuleVersion(db, {
    courseId,
    minContentProgressPercentage: 0,
    requireAllMandatoryItems: true,
    createdByUserId: adminUserId,
  });

  const result = await evaluateEnrollmentCompletion(db, enrollmentId);

  const mandatoryRequirement = result.requirements.find((requirement) => requirement.key === "mandatory_items");

  assert.equal(mandatoryRequirement, undefined);
  assert.equal(result.eligible, true);
});

test("nota mínima sem nenhuma atividade corrigida: requisito aparece com actual null e met false", async () => {
  await createRuleVersion(db, {
    courseId,
    minAverageGrade: 7,
    requireAllMandatoryItems: false,
    createdByUserId: adminUserId,
  });

  const result = await evaluateEnrollmentCompletion(db, enrollmentId);

  const gradeRequirement = result.requirements.find((requirement) => requirement.key === "average_grade");

  assert.ok(gradeRequirement);
  assert.equal(gradeRequirement.actual, null);
  assert.equal(gradeRequirement.met, false);
});
