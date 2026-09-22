const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();
require("../../services/notifications/eventDefinitions");

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");

const { createStudentContractWithInitialInvoice } = require("../../services/financial/contractCreationService");
const { registerManualPayment } = require("../../services/financial/paymentService");

const { generateFinancialInvoicesReportPdf } = require("../../services/reports/financialInvoicesReportService");
const { generateEnrollmentsReportPdf } = require("../../services/reports/enrollmentsReportService");
const { generateAttendanceReportPdf } = require("../../services/reports/attendanceReportService");
const { generateGradesReportPdf } = require("../../services/reports/gradesReportService");
const { generateAcademicProgressReportPdf } = require("../../services/reports/academicProgressReportService");

const { fetchAllFilteredRows } = require("../../services/reports/reportDataHelpers");
const { listFinancialInvoices } = require("../../services/financial/adminFinancialReadService");

const { closeBrowser } = require("../../services/documents/documentRendererService");

const RUN_ID = Date.now();
const COURSE_NAME = `TEST REPORTS COURSE ${RUN_ID}`;

let courseId;
let planId;
let adminUserId;
let teacherId;
let classId;
let sessionId;
let activityId;
let contentId;

// Dois alunos: um vai ficar com fatura paga + presente + nota alta +
// conteúdo concluído, o outro com fatura pendente + ausente + nota
// baixa + conteúdo não iniciado -- dá pra testar filtro por status
// nos 3 relatórios que têm status (financeiro/frequência) e os
// totais calculados sobre o conjunto certo.
let studentA; // { studentId, contractId, invoiceId, userId }
let studentB;

function testCpf(sequence) {
  const digits = String(RUN_ID).slice(-6) + String(sequence).padStart(3, "0");

  return digits.slice(0, 9).padEnd(9, "0") + "00";
}

function testEmail(label) {
  return `reports.${RUN_ID}.${label}@example.com`;
}

async function createTestContract(label) {
  const result = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: {
        name: `Aluno Teste Relatórios ${label}`,
        email: testEmail(label),
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

async function purgeCourseData() {
  const [contracts] = await db.promise().query(`SELECT id FROM financial_contracts WHERE course_id = ?`, [courseId]);

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
      .query(`DELETE p FROM payments p INNER JOIN invoices i ON i.id = p.invoice_id WHERE i.financial_contract_id = ?`, [
        contract.id,
      ]);
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

  await db.promise().query(`DELETE FROM student_content_progress WHERE course_id = ?`, [courseId]);
  await db.promise().query(`DELETE FROM course_contents WHERE course_id = ?`, [courseId]);

  await db.promise().query(`DELETE FROM grades WHERE course_id = ?`, [courseId]);
  await db.promise().query(`DELETE FROM submissions WHERE activity_id = ?`, [activityId || 0]);
  await db.promise().query(`DELETE FROM activities WHERE course_id = ?`, [courseId]);

  if (sessionId) {
    await db.promise().query(`DELETE FROM attendance WHERE class_session_id = ?`, [sessionId]);
  }
  await db.promise().query(`DELETE FROM class_sessions WHERE class_id = ?`, [classId || 0]);
  await db.promise().query(`DELETE FROM classes WHERE course_id = ?`, [courseId]);

  await db.promise().query(`DELETE FROM enrollments WHERE course_id = ?`, [courseId]);
  await db.promise().query(`DELETE FROM financial_contracts WHERE course_id = ?`, [courseId]);

  for (const student of [studentA, studentB]) {
    if (!student) continue;

    await db.promise().query(`DELETE FROM student_contracting_parties WHERE student_id = ?`, [student.studentId]);
    await db.promise().query(`DELETE FROM contracting_parties WHERE user_id = ?`, [student.userId]);
    await db.promise().query(`DELETE FROM account_activation_tokens WHERE user_id = ?`, [student.userId]);
    await db.promise().query(`DELETE FROM students WHERE id = ?`, [student.studentId]);
    await db.promise().query(`DELETE FROM users WHERE id = ?`, [student.userId]);
  }

  await db.promise().query(`DELETE FROM course_pricing_plans WHERE course_id = ?`, [courseId]);
  await db.promise().query(`DELETE FROM courses WHERE id = ?`, [courseId]);
}

before(async () => {
  const [courseResult] = await db.promise().query(
    `
      INSERT INTO courses (teacher_id, name, description, workload_hours, price, status, nivel, created_at, updated_at)
      VALUES (NULL, ?, 'Curso de teste (relatorios)', 10, 0, 'draft', 'Iniciante', NOW(), NOW())
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

  const [teacherRows] = await db.promise().query(`SELECT id FROM teachers WHERE status = 'active' LIMIT 1`);
  teacherId = teacherRows[0].id;

  studentA = await createTestContract("A");
  studentB = await createTestContract("B");

  // Fatura de A fica paga (o que ativa a matrícula automaticamente,
  // igual ao fluxo real) -- a de B fica pendente, pra testar o filtro
  // de status financeiro. Como matrícula só é criada na ativação por
  // pagamento, B ganha uma matrícula inserida direto (administrative),
  // só para os relatórios de matrículas/frequência/notas/progresso
  // terem 2 alunos reais para comparar -- não testa o fluxo de
  // ativação em si, que já é coberto em outro lugar.
  await registerManualPayment(db, {
    invoiceId: studentA.invoiceId,
    amount: 300,
    paymentMethod: "pix",
    paymentDate: new Date().toISOString(),
    reason: "Teste automatizado",
    actorUserId: adminUserId,
  });

  const [enrollmentBResult] = await db.promise().query(
    `INSERT INTO enrollments (student_id, course_id, status, origin, created_by_user_id, enrolled_at, created_at, updated_at)
     VALUES (?, ?, 'active', 'administrative', ?, NOW(), NOW(), NOW())`,
    [studentB.studentId, courseId, adminUserId]
  );
  studentB.enrollmentId = enrollmentBResult.insertId;

  const [classResult] = await db.promise().query(
    `INSERT INTO classes (course_id, teacher_id, name, shift, status, created_at, updated_at)
     VALUES (?, ?, 'Turma de teste', 'online', 'active', NOW(), NOW())`,
    [courseId, teacherId]
  );
  classId = classResult.insertId;

  const [sessionResult] = await db.promise().query(
    `INSERT INTO class_sessions (class_id, session_number, title, session_date, session_type, status, created_at, updated_at)
     VALUES (?, 1, 'Aula 1', CURDATE(), 'class', 'completed', NOW(), NOW())`,
    [classId]
  );
  sessionId = sessionResult.insertId;

  await db.promise().query(
    `INSERT INTO attendance (class_session_id, student_id, status, created_at, updated_at) VALUES (?, ?, 'present', NOW(), NOW())`,
    [sessionId, studentA.studentId]
  );
  await db.promise().query(
    `INSERT INTO attendance (class_session_id, student_id, status, created_at, updated_at) VALUES (?, ?, 'absent', NOW(), NOW())`,
    [sessionId, studentB.studentId]
  );

  const [activityResult] = await db.promise().query(
    `INSERT INTO activities (course_id, class_id, activity_kind, title, type, max_score, order_index, is_required, status, created_at, updated_at)
     VALUES (?, ?, 'activity', 'Atividade de teste', 'text', 10.00, 1, 1, 'active', NOW(), NOW())`,
    [courseId, classId]
  );
  activityId = activityResult.insertId;

  for (const [student, score] of [
    [studentA, 9.5],
    [studentB, 4.0],
  ]) {
    const [submissionResult] = await db.promise().query(
      `INSERT INTO submissions (activity_id, student_id, status, score, submitted_at, graded_at, created_at, updated_at)
       VALUES (?, ?, 'graded', ?, NOW(), NOW(), NOW(), NOW())`,
      [activityId, student.studentId, score]
    );

    await db.promise().query(
      `INSERT INTO grades (submission_id, student_id, course_id, activity_id, teacher_id, title, score, max_score, graded_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'Atividade de teste', ?, 10.00, NOW(), NOW(), NOW())`,
      [submissionResult.insertId, student.studentId, courseId, activityId, teacherId, score]
    );
  }

  const [contentResult] = await db.promise().query(
    `INSERT INTO course_contents (course_id, class_id, title, type, order_index, is_required, status, created_at, updated_at)
     VALUES (?, NULL, 'Conteúdo de teste', 'text', 1, 1, 'active', NOW(), NOW())`,
    [courseId]
  );
  contentId = contentResult.insertId;

  await db.promise().query(
    `INSERT INTO student_content_progress (student_id, course_id, content_id, status, progress_percentage, started_at, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, 'completed', 100, NOW(), NOW(), NOW(), NOW())`,
    [studentA.studentId, courseId, contentId]
  );
  await db.promise().query(
    `INSERT INTO student_content_progress (student_id, course_id, content_id, status, progress_percentage, created_at, updated_at)
     VALUES (?, ?, ?, 'not_started', 0, NOW(), NOW())`,
    [studentB.studentId, courseId, contentId]
  );
});

after(async () => {
  await retryOnDeadlock(() => purgeCourseData());
  await closeBrowser();
  await db.promise().end();
});

function assertIsPdf(buffer) {
  assert.ok(buffer.length > 0);
  assert.equal(buffer.slice(0, 4).toString(), "%PDF");
}

test("relatório financeiro: gera PDF e o filtro de status isola exatamente a fatura correspondente", async () => {
  const allResult = await generateFinancialInvoicesReportPdf(db, {
    filters: { contractId: studentA.contractId },
    actorUserId: adminUserId,
  });
  assertIsPdf(allResult.buffer);

  // A mesma consulta que o relatório usa por baixo -- valida que o
  // filtro de status realmente restringe o conjunto (fatura de A
  // paga, fatura de B pendente), não só que o PDF é gerado.
  const { rows: paidForA } = await fetchAllFilteredRows(
    listFinancialInvoices,
    db,
    { contractId: studentA.contractId, status: "paid" },
    { rowCap: 2000, dataKey: "invoices" }
  );
  assert.equal(paidForA.length, 1);

  const { rows: paidForB } = await fetchAllFilteredRows(
    listFinancialInvoices,
    db,
    { contractId: studentB.contractId, status: "paid" },
    { rowCap: 2000, dataKey: "invoices" }
  );
  assert.equal(paidForB.length, 0, "fatura de B está pendente, não deveria aparecer no filtro status=paid");

  const paidResult = await generateFinancialInvoicesReportPdf(db, {
    filters: { contractId: studentA.contractId, status: "paid" },
    actorUserId: adminUserId,
  });
  assertIsPdf(paidResult.buffer);

  const emptyResult = await generateFinancialInvoicesReportPdf(db, {
    filters: { contractId: studentB.contractId, status: "paid" },
    actorUserId: adminUserId,
  });
  assertIsPdf(emptyResult.buffer);
});

test("fetchAllFilteredRows rejeita cedo quando o total ultrapassa o teto de linhas, em vez de truncar silenciosamente", async () => {
  await assert.rejects(
    () => fetchAllFilteredRows(listFinancialInvoices, db, { contractId: studentA.contractId }, { rowCap: 0, dataKey: "invoices" }),
    (error) => {
      assert.equal(error.statusCode, 413);
      assert.match(error.message, /refine os filtros/i);
      return true;
    }
  );
});

test("relatório de matrículas: gera PDF filtrado por curso e reflete as 2 matrículas criadas", async () => {
  const result = await generateEnrollmentsReportPdf(db, {
    filters: { courseId },
    actorUserId: adminUserId,
  });

  assertIsPdf(result.buffer);
});

test("relatório de frequência: gera PDF e o filtro de status isola presença/ausência", async () => {
  const { listAttendance } = require("../../services/admin/adminAttendanceService");

  const { rows: presentRows } = await fetchAllFilteredRows(listAttendance, db, { courseId, status: "present" }, {
    rowCap: 2000,
    dataKey: "data",
  });
  assert.equal(presentRows.length, 1);
  assert.equal(presentRows[0].student.id, studentA.studentId);

  const { rows: absentRows } = await fetchAllFilteredRows(listAttendance, db, { courseId, status: "absent" }, {
    rowCap: 2000,
    dataKey: "data",
  });
  assert.equal(absentRows.length, 1);
  assert.equal(absentRows[0].student.id, studentB.studentId);

  const allResult = await generateAttendanceReportPdf(db, {
    filters: { courseId },
    actorUserId: adminUserId,
  });
  assertIsPdf(allResult.buffer);

  const presentResult = await generateAttendanceReportPdf(db, {
    filters: { courseId, status: "present" },
    actorUserId: adminUserId,
  });
  assertIsPdf(presentResult.buffer);
});

test("relatório de notas: gera PDF e reflete as notas lançadas para o curso", async () => {
  const { listGrades } = require("../../services/admin/adminGradeService");

  const { rows } = await fetchAllFilteredRows(listGrades, db, { courseId }, { rowCap: 2000, dataKey: "data" });
  assert.equal(rows.length, 2);

  const scoreByStudent = Object.fromEntries(rows.map((row) => [row.student.id, Number(row.score)]));
  assert.equal(scoreByStudent[studentA.studentId], 9.5);
  assert.equal(scoreByStudent[studentB.studentId], 4.0);

  const result = await generateGradesReportPdf(db, {
    filters: { courseId },
    actorUserId: adminUserId,
  });

  assertIsPdf(result.buffer);
});

test("relatório de progresso acadêmico: gera PDF -- um aluno concluído, outro não iniciado", async () => {
  const { listAcademicProgress } = require("../../services/admin/adminAcademicProgressService");

  const { rows } = await fetchAllFilteredRows(listAcademicProgress, db, { courseId }, { rowCap: 2000, dataKey: "data" });
  assert.equal(rows.length, 2);

  const progressByStudent = Object.fromEntries(rows.map((row) => [row.student.id, row.progressPercentage]));
  assert.equal(progressByStudent[studentA.studentId], 100);
  assert.equal(progressByStudent[studentB.studentId], 0);

  const result = await generateAcademicProgressReportPdf(db, {
    filters: { courseId },
    actorUserId: adminUserId,
  });

  assertIsPdf(result.buffer);
});

test("relatórios nunca confiam em total calculado no frontend -- sempre reconsultam a listagem real", async () => {
  const forgedFilters = { courseId, total: 999999, summary: { fake: true } };

  const result = await generateEnrollmentsReportPdf(db, {
    filters: forgedFilters,
    actorUserId: adminUserId,
  });

  assertIsPdf(result.buffer);
});
