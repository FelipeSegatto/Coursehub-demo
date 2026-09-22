const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();
require("../../services/notifications/eventDefinitions");

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");

const { createStudentContractWithInitialInvoice } = require("../../services/financial/contractCreationService");
const { registerManualPayment } = require("../../services/financial/paymentService");

const {
  listEnrollmentsForProgress,
  getEnrollmentProgressDetail,
} = require("../../services/admin/adminStudentProgressService");
const { generateStudentProgressPdf } = require("../../services/reports/studentProgressPdfService");
const authorizeRoles = require("../../middlewares/authorizeRoles");
const { closeBrowser } = require("../../services/documents/documentRendererService");

const RUN_ID = Date.now();
const COURSE_PREFIX = `TEST STUDENT PROGRESS ${RUN_ID}`;

let adminUserId;
let studentId;
let studentUserId;

// Curso 1: com contrato financeiro pago (via checkout), tem turma
// (classA), conteúdos obrigatórios + 1 opcional + 1 de outra turma,
// 1 atividade sem submissão (nunca corrigida).
let course1Id;
let planId;
let classAId;
let classBId; // segunda turma do mesmo curso, só pra hospedar o conteúdo "de outra turma"
let enrollment1Id;
let requiredContentDoneId;
let requiredContentPendingId;
let optionalContentDoneId;
let otherClassContentId;
let activity1Id;

// Curso 2: matrícula direta (sem contrato financeiro), sem turma, sem
// nenhum conteúdo acompanhável -- testa percentual nulo.
let course2Id;
let enrollment2Id;

// Curso 3: matrícula direta (sem contrato), com turma, 2 conteúdos
// nenhum obrigatório -- testa fallback pra "todos" quando não há
// obrigatório.
let course3Id;
let classCId;
let enrollment3Id;
let fallbackContentDoneId;
let fallbackContentPendingId;

function testCpf(sequence) {
  const digits = String(RUN_ID).slice(-6) + String(sequence).padStart(3, "0");

  return digits.slice(0, 9).padEnd(9, "0") + "00";
}

async function purgeAll() {
  const courseIds = [course1Id, course2Id, course3Id].filter(Boolean);

  if (course1Id) {
    const [contracts] = await db.promise().query(`SELECT id FROM financial_contracts WHERE course_id = ?`, [
      course1Id,
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
  }

  for (const courseId of courseIds) {
    const [enrollments] = await db.promise().query(`SELECT id FROM enrollments WHERE course_id = ?`, [courseId]);

    for (const enrollment of enrollments) {
      await db.promise().query(`DELETE FROM financial_events WHERE enrollment_id = ?`, [enrollment.id]);
    }

    await db.promise().query(`DELETE FROM student_content_progress WHERE course_id = ?`, [courseId]);
    await db.promise().query(`DELETE FROM course_contents WHERE course_id = ?`, [courseId]);
  }

  if (activity1Id) {
    await db.promise().query(`DELETE FROM submissions WHERE activity_id = ?`, [activity1Id]);
  }
  for (const courseId of courseIds) {
    await db.promise().query(`DELETE FROM activities WHERE course_id = ?`, [courseId]);
  }

  if (classAId || classBId) {
    for (const id of [classAId, classBId]) {
      if (!id) continue;
      await db.promise().query(`DELETE FROM class_sessions WHERE class_id = ?`, [id]);
    }
  }
  if (classCId) await db.promise().query(`DELETE FROM class_sessions WHERE class_id = ?`, [classCId]);

  for (const courseId of courseIds) {
    await db.promise().query(`DELETE FROM classes WHERE course_id = ?`, [courseId]);
  }

  for (const courseId of courseIds) {
    await db.promise().query(`DELETE FROM enrollments WHERE course_id = ?`, [courseId]);
    await db.promise().query(`DELETE FROM financial_contracts WHERE course_id = ?`, [courseId]);
  }

  if (studentId) {
    await db.promise().query(`DELETE FROM student_contracting_parties WHERE student_id = ?`, [studentId]);
    await db.promise().query(`DELETE FROM contracting_parties WHERE user_id = ?`, [studentUserId]);
    await db.promise().query(`DELETE FROM account_activation_tokens WHERE user_id = ?`, [studentUserId]);
    await db.promise().query(`DELETE FROM students WHERE id = ?`, [studentId]);
    await db.promise().query(`DELETE FROM users WHERE id = ?`, [studentUserId]);
  }

  for (const courseId of courseIds) {
    await db.promise().query(`DELETE FROM course_pricing_plans WHERE course_id = ?`, [courseId]);
    await db.promise().query(`DELETE FROM courses WHERE id = ?`, [courseId]);
  }
}

before(async () => {
  const [adminRows] = await db.promise().query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
  adminUserId = adminRows[0].id;

  const [teacherRows] = await db.promise().query(`SELECT id FROM teachers WHERE status = 'active' LIMIT 1`);
  const teacherId = teacherRows[0].id;

  // ---- Curso 1 ----
  const [course1Result] = await db.promise().query(
    `INSERT INTO courses (teacher_id, name, description, workload_hours, price, status, nivel, created_at, updated_at)
     VALUES (NULL, ?, 'teste', 10, 0, 'draft', 'Iniciante', NOW(), NOW())`,
    [`${COURSE_PREFIX} 1`]
  );
  course1Id = course1Result.insertId;

  const [planResult] = await db.promise().query(
    `INSERT INTO course_pricing_plans
       (course_id, name, description, billing_type, total_amount, monthly_payment_count,
        monthly_payment_amount, max_card_installments, accepts_pix, accepts_boleto,
        accepts_credit_card, status, created_at, updated_at)
     VALUES (?, 'Plano', NULL, 'one_time', 100.00, NULL, NULL, 1, 1, 1, 1, 'active', NOW(), NOW())`,
    [course1Id]
  );
  planId = planResult.insertId;

  const contractResult = await createStudentContractWithInitialInvoice(
    db,
    {
      newStudentData: {
        name: `Aluno Teste Progresso ${RUN_ID}`,
        email: `student.progress.${RUN_ID}@example.com`,
        birth_date: "2000-05-01",
        cpf: testCpf(1),
        phone: "11999990000",
      },
      contractingPartyMode: "self",
      courseId: course1Id,
      pricingPlanId: planId,
      billingData: { dueDate: "2026-12-01" },
    },
    adminUserId
  );

  studentId = contractResult.studentId;

  const [studentRows] = await db.promise().query(`SELECT user_id FROM students WHERE id = ?`, [studentId]);
  studentUserId = studentRows[0].user_id;

  const paymentResult = await registerManualPayment(db, {
    invoiceId: contractResult.invoiceId,
    amount: 100,
    paymentMethod: "pix",
    paymentDate: new Date().toISOString(),
    reason: "Teste automatizado",
    actorUserId: adminUserId,
  });

  enrollment1Id = paymentResult.activationResult.enrollmentId;

  const [classAResult] = await db.promise().query(
    `INSERT INTO classes (course_id, teacher_id, name, shift, status, created_at, updated_at)
     VALUES (?, ?, 'Turma A', 'online', 'active', NOW(), NOW())`,
    [course1Id, teacherId]
  );
  classAId = classAResult.insertId;

  const [classBResult] = await db.promise().query(
    `INSERT INTO classes (course_id, teacher_id, name, shift, status, created_at, updated_at)
     VALUES (?, ?, 'Turma B', 'online', 'active', NOW(), NOW())`,
    [course1Id, teacherId]
  );
  classBId = classBResult.insertId;

  await db.promise().query(`UPDATE enrollments SET class_id = ? WHERE id = ?`, [classAId, enrollment1Id]);

  const [requiredDoneResult] = await db.promise().query(
    `INSERT INTO course_contents (course_id, class_id, title, type, order_index, is_required, status, created_at, updated_at)
     VALUES (?, NULL, 'Conteúdo obrigatório concluído', 'text', 1, 1, 'active', NOW(), NOW())`,
    [course1Id]
  );
  requiredContentDoneId = requiredDoneResult.insertId;

  const [requiredPendingResult] = await db.promise().query(
    `INSERT INTO course_contents (course_id, class_id, title, type, order_index, is_required, status, created_at, updated_at)
     VALUES (?, NULL, 'Conteúdo obrigatório pendente', 'text', 2, 1, 'active', NOW(), NOW())`,
    [course1Id]
  );
  requiredContentPendingId = requiredPendingResult.insertId;

  const [optionalDoneResult] = await db.promise().query(
    `INSERT INTO course_contents (course_id, class_id, title, type, order_index, is_required, status, created_at, updated_at)
     VALUES (?, NULL, 'Conteúdo opcional concluído', 'text', 3, 0, 'active', NOW(), NOW())`,
    [course1Id]
  );
  optionalContentDoneId = optionalDoneResult.insertId;

  const [otherClassResult] = await db.promise().query(
    `INSERT INTO course_contents (course_id, class_id, title, type, order_index, is_required, status, created_at, updated_at)
     VALUES (?, ?, 'Conteúdo exclusivo da Turma B', 'text', 4, 1, 'active', NOW(), NOW())`,
    [course1Id, classBId]
  );
  otherClassContentId = otherClassResult.insertId;

  await db.promise().query(
    `INSERT INTO student_content_progress (student_id, course_id, content_id, status, progress_percentage, started_at, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, 'completed', 100, NOW(), NOW(), NOW(), NOW())`,
    [studentId, course1Id, requiredContentDoneId]
  );
  await db.promise().query(
    `INSERT INTO student_content_progress (student_id, course_id, content_id, status, progress_percentage, started_at, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, 'completed', 100, NOW(), NOW(), NOW(), NOW())`,
    [studentId, course1Id, optionalContentDoneId]
  );

  const [activity1Result] = await db.promise().query(
    `INSERT INTO activities (course_id, class_id, activity_kind, title, type, max_score, order_index, is_required, status, created_at, updated_at)
     VALUES (?, NULL, 'activity', 'Atividade sem entrega', 'text', 10.00, 1, 1, 'active', NOW(), NOW())`,
    [course1Id]
  );
  activity1Id = activity1Result.insertId;

  // ---- Curso 2: matrícula sem contrato, sem turma, sem conteúdo ----
  const [course2Result] = await db.promise().query(
    `INSERT INTO courses (teacher_id, name, description, workload_hours, price, status, nivel, created_at, updated_at)
     VALUES (NULL, ?, 'teste', 10, 0, 'draft', 'Iniciante', NOW(), NOW())`,
    [`${COURSE_PREFIX} 2`]
  );
  course2Id = course2Result.insertId;

  const [enrollment2Result] = await db.promise().query(
    `INSERT INTO enrollments (student_id, course_id, status, origin, created_by_user_id, enrolled_at, created_at, updated_at)
     VALUES (?, ?, 'active', 'administrative', ?, NOW(), NOW(), NOW())`,
    [studentId, course2Id, adminUserId]
  );
  enrollment2Id = enrollment2Result.insertId;

  // ---- Curso 3: matrícula sem contrato, com turma, nenhum conteúdo obrigatório ----
  const [course3Result] = await db.promise().query(
    `INSERT INTO courses (teacher_id, name, description, workload_hours, price, status, nivel, created_at, updated_at)
     VALUES (NULL, ?, 'teste', 10, 0, 'draft', 'Iniciante', NOW(), NOW())`,
    [`${COURSE_PREFIX} 3`]
  );
  course3Id = course3Result.insertId;

  const [classCResult] = await db.promise().query(
    `INSERT INTO classes (course_id, teacher_id, name, shift, status, created_at, updated_at)
     VALUES (?, ?, 'Turma C', 'online', 'active', NOW(), NOW())`,
    [course3Id, teacherId]
  );
  classCId = classCResult.insertId;

  const [enrollment3Result] = await db.promise().query(
    `INSERT INTO enrollments (student_id, course_id, class_id, status, origin, created_by_user_id, enrolled_at, created_at, updated_at)
     VALUES (?, ?, ?, 'active', 'administrative', ?, NOW(), NOW(), NOW())`,
    [studentId, course3Id, classCId, adminUserId]
  );
  enrollment3Id = enrollment3Result.insertId;

  const [fallbackDoneResult] = await db.promise().query(
    `INSERT INTO course_contents (course_id, class_id, title, type, order_index, is_required, status, created_at, updated_at)
     VALUES (?, NULL, 'Conteúdo A (nenhum obrigatório)', 'text', 1, 0, 'active', NOW(), NOW())`,
    [course3Id]
  );
  fallbackContentDoneId = fallbackDoneResult.insertId;

  const [fallbackPendingResult] = await db.promise().query(
    `INSERT INTO course_contents (course_id, class_id, title, type, order_index, is_required, status, created_at, updated_at)
     VALUES (?, NULL, 'Conteúdo B (nenhum obrigatório)', 'text', 2, 0, 'active', NOW(), NOW())`,
    [course3Id]
  );
  fallbackContentPendingId = fallbackPendingResult.insertId;

  await db.promise().query(
    `INSERT INTO student_content_progress (student_id, course_id, content_id, status, progress_percentage, started_at, completed_at, created_at, updated_at)
     VALUES (?, ?, ?, 'completed', 100, NOW(), NOW(), NOW(), NOW())`,
    [studentId, course3Id, fallbackContentDoneId]
  );
});

after(async () => {
  await retryOnDeadlock(() => purgeAll());
  await closeBrowser();
  await db.promise().end();
});

test("listagem: o mesmo aluno aparece em uma linha por matrícula, nunca colapsado", async () => {
  const result = await listEnrollmentsForProgress(db, { search: `${COURSE_PREFIX}`, status: "all" });

  const enrollmentIds = result.data.map((row) => row.enrollmentId);

  assert.ok(enrollmentIds.includes(enrollment1Id));
  assert.ok(enrollmentIds.includes(enrollment2Id));
  assert.ok(enrollmentIds.includes(enrollment3Id));

  const forThisStudent = result.data.filter((row) => row.student.id === studentId);
  assert.equal(forThisStudent.length, 3, "o mesmo aluno deve aparecer em 3 linhas distintas, uma por matrícula");
});

test("listagem: sem filtro de status explícito, mostra só matrículas ativas por padrão", async () => {
  const result = await listEnrollmentsForProgress(db, { search: `${COURSE_PREFIX}` });

  assert.ok(result.data.every((row) => row.status === "active"));
});

test("listagem: filtro de status inválido rejeita com 400", async () => {
  await assert.rejects(
    () => listEnrollmentsForProgress(db, { status: "not-a-real-status" }),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    }
  );
});

test("detalhe: matrícula sem contrato financeiro funciona normalmente", async () => {
  const detail = await getEnrollmentProgressDetail(db, enrollment2Id);

  assert.equal(detail.enrollment.id, enrollment2Id);
  assert.equal(detail.enrollment.financialContract, null);
});

test("detalhe: percentual considera só obrigatórios, exclui conteúdo de outra turma", async () => {
  const detail = await getEnrollmentProgressDetail(db, enrollment1Id);

  // Só os 2 conteúdos obrigatórios da Turma A entram no cálculo -- o
  // opcional concluído e o conteúdo exclusivo da Turma B ficam fora.
  assert.equal(detail.contentSummary.totalContents, 2);
  assert.equal(detail.contentSummary.completedContents, 1);
  assert.equal(detail.contentSummary.progressPercentage, 50);

  const contentIds = detail.contents.map((c) => c.contentId);
  assert.ok(!contentIds.includes(optionalContentDoneId), "opcional concluído não deveria contar (há obrigatórios)");
  assert.ok(!contentIds.includes(otherClassContentId), "conteúdo de outra turma nunca deveria entrar no cálculo");
});

test("detalhe: sem nenhum obrigatório, cai no fallback e considera todos os conteúdos", async () => {
  const detail = await getEnrollmentProgressDetail(db, enrollment3Id);

  assert.equal(detail.contentSummary.totalContents, 2);
  assert.equal(detail.contentSummary.completedContents, 1);
  assert.equal(detail.contentSummary.progressPercentage, 50);

  const contentIds = detail.contents.map((c) => c.contentId);
  assert.ok(contentIds.includes(fallbackContentDoneId));
  assert.ok(contentIds.includes(fallbackContentPendingId));
});

test("detalhe: curso sem nenhum conteúdo acompanhável retorna percentual nulo, nunca um falso 0%", async () => {
  const detail = await getEnrollmentProgressDetail(db, enrollment2Id);

  assert.equal(detail.contentSummary.totalContents, 0);
  assert.equal(detail.contentSummary.progressPercentage, null);
});

test("detalhe: resumo acadêmico não inventa nota quando não há nenhuma corrigida", async () => {
  const detail = await getEnrollmentProgressDetail(db, enrollment1Id);

  assert.equal(detail.academicSummary.total_items, 1);
  assert.equal(detail.academicSummary.graded_items, 0);
  assert.equal(detail.academicSummary.average_grade, null);
});

test("detalhe: frequência só aparece quando a matrícula tem turma definida", async () => {
  const withClass = await getEnrollmentProgressDetail(db, enrollment1Id);
  assert.ok(withClass.attendance, "matrícula com turma deveria ter seção de frequência");

  const withoutClass = await getEnrollmentProgressDetail(db, enrollment2Id);
  assert.equal(withoutClass.attendance, null, "matrícula sem turma não deveria ter frequência");
});

test("detalhe: matrícula inexistente devolve 404, id inválido devolve 400", async () => {
  await assert.rejects(
    () => getEnrollmentProgressDetail(db, 999999999),
    (error) => {
      assert.equal(error.statusCode, 404);
      return true;
    }
  );

  await assert.rejects(
    () => getEnrollmentProgressDetail(db, "not-a-number"),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    }
  );
});

test("PDF: gera um PDF real e não cria nenhuma linha em generated_documents", async () => {
  const [beforeRows] = await db.promise().query(`SELECT COUNT(*) AS total FROM generated_documents`);

  const { buffer, filename } = await generateStudentProgressPdf(db, {
    enrollmentId: enrollment1Id,
    actorUserId: adminUserId,
  });

  assert.ok(buffer.length > 0);
  assert.equal(buffer.slice(0, 4).toString(), "%PDF");
  assert.equal(filename, `progresso-aluno-${enrollment1Id}.pdf`);

  const [afterRows] = await db.promise().query(`SELECT COUNT(*) AS total FROM generated_documents`);
  assert.equal(Number(afterRows[0].total), Number(beforeRows[0].total));
});

test("autorização: authorizeRoles(admin) recusa quem não é admin e quem não está autenticado", () => {
  const middleware = authorizeRoles("admin");

  let statusCode = null;
  let jsonBody = null;
  let nextCalled = false;

  function buildRes() {
    return {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        jsonBody = body;
        return this;
      },
    };
  }

  // Sem req.auth (não autenticado).
  middleware({}, buildRes(), () => {
    nextCalled = true;
  });
  assert.equal(statusCode, 401);
  assert.ok(jsonBody.message);
  assert.equal(nextCalled, false);

  // Autenticado, mas role errada.
  statusCode = null;
  jsonBody = null;
  middleware({ auth: { userId: 1, role: "student" } }, buildRes(), () => {
    nextCalled = true;
  });
  assert.equal(statusCode, 403);
  assert.equal(nextCalled, false);

  // Role correta -- chama next().
  nextCalled = false;
  middleware({ auth: { userId: 1, role: "admin" } }, buildRes(), () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
});
