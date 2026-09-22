const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

require("dotenv").config();

const db = require("../../db");
const { retryOnDeadlock } = require("../testHelpers");

const {
  createPricingPlan,
  updatePricingPlan,
  updatePricingPlanStatus,
  deletePricingPlan,
  listPricingPlans,
  getPricingPlanById,
} = require("../../services/courses/coursePricingPlanService");

const {
  getPricingSummaryForCourse,
  attachPricingToCourses,
} = require("../../services/courses/coursePricingService");

const { createEnrollment } = require("../../services/admin/adminEnrollmentService");

// Fixture: two disposable courses (teacher_id NULL is allowed), built
// from scratch instead of reusing courses 1-10 -- those are real
// seeded catalog courses with real financial_contracts referencing
// them; a pricing CRUD test suite that creates/edits/deletes plans
// has no business touching that data. Student 58 (user 79) is a real
// fixture but only ever read here except for the one disposable
// enrollment this file creates and cleans up itself.
const COURSE_A_NAME = "TEST PRICING COURSE A";
const COURSE_B_NAME = "TEST PRICING COURSE B";
const STUDENT_ID = 58;

let courseAId;
let courseBId;
const createdPlanIds = [];
const createdEnrollmentIds = [];

async function cleanupStaleFixtures() {
  const [staleCourses] = await db
    .promise()
    .query(`SELECT id FROM courses WHERE name IN (?, ?)`, [COURSE_A_NAME, COURSE_B_NAME]);

  if (staleCourses.length === 0) {
    return;
  }

  const staleCourseIds = staleCourses.map((row) => row.id);
  const coursePlaceholders = staleCourseIds.map(() => "?").join(",");

  const [staleEnrollments] = await db
    .promise()
    .query(`SELECT id FROM enrollments WHERE course_id IN (${coursePlaceholders})`, staleCourseIds);

  if (staleEnrollments.length > 0) {
    const enrollmentIds = staleEnrollments.map((row) => row.id);
    const enrollmentPlaceholders = enrollmentIds.map(() => "?").join(",");

    await db
      .promise()
      .query(`DELETE FROM financial_contracts WHERE enrollment_id IN (${enrollmentPlaceholders})`, enrollmentIds);

    await db
      .promise()
      .query(`DELETE FROM enrollments WHERE id IN (${enrollmentPlaceholders})`, enrollmentIds);
  }

  await db
    .promise()
    .query(`DELETE FROM course_pricing_plans WHERE course_id IN (${coursePlaceholders})`, staleCourseIds);

  await db.promise().query(`DELETE FROM courses WHERE id IN (${coursePlaceholders})`, staleCourseIds);
}

async function createTestCourse(name) {
  const [result] = await db.promise().query(
    `
      INSERT INTO courses (teacher_id, name, description, workload_hours, price, status, nivel, created_at, updated_at)
      VALUES (NULL, ?, 'Curso de teste (suíte de planos comerciais)', 10, 0, 'draft', 'Iniciante', NOW(), NOW())
    `,
    [name]
  );

  return result.insertId;
}

before(async () => {
  await cleanupStaleFixtures();

  courseAId = await createTestCourse(COURSE_A_NAME);
  courseBId = await createTestCourse(COURSE_B_NAME);
});

after(async () => {
  if (createdEnrollmentIds.length > 0) {
    const placeholders = createdEnrollmentIds.map(() => "?").join(",");

    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM financial_contracts WHERE enrollment_id IN (${placeholders})`, createdEnrollmentIds)
    );

    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM enrollments WHERE id IN (${placeholders})`, createdEnrollmentIds)
    );
  }

  if (createdPlanIds.length > 0) {
    const placeholders = createdPlanIds.map(() => "?").join(",");

    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM course_pricing_plans WHERE id IN (${placeholders})`, createdPlanIds)
    );
  }

  const courseIds = [courseAId, courseBId].filter(Boolean);

  if (courseIds.length > 0) {
    const placeholders = courseIds.map(() => "?").join(",");

    // Backstop for any plan this file created but didn't individually
    // track (defensive -- every test below does push into
    // createdPlanIds, but a plan created and then immediately
    // duplicated/rejected wouldn't be, so this catches leftovers by
    // course_id instead of relying only on the id list above).
    await retryOnDeadlock(() =>
      db.promise().query(`DELETE FROM course_pricing_plans WHERE course_id IN (${placeholders})`, courseIds)
    );

    await retryOnDeadlock(() => db.promise().query(`DELETE FROM courses WHERE id IN (${placeholders})`, courseIds));
  }

  await db.promise().end();
});

function baseOneTimePayload(overrides = {}) {
  return {
    course_id: courseAId,
    name: "Pagamento à vista (teste)",
    description: "Plano de teste à vista.",
    billing_type: "one_time",
    total_amount: 1000,
    accepts_pix: true,
    accepts_boleto: false,
    accepts_credit_card: false,
    status: "active",
    ...overrides,
  };
}

function baseMonthlyPayload(overrides = {}) {
  return {
    course_id: courseAId,
    name: "Plano mensal (teste)",
    description: "Plano de teste mensal.",
    billing_type: "monthly_plan",
    monthly_payment_count: 6,
    monthly_payment_amount: 280,
    accepts_pix: true,
    accepts_boleto: false,
    accepts_credit_card: false,
    status: "active",
    ...overrides,
  };
}

// -----------------------------------------------------------------
// Criação
// -----------------------------------------------------------------

test("creates a one_time pricing plan", async () => {
  const plan = await createPricingPlan(db, baseOneTimePayload());

  createdPlanIds.push(plan.id);

  assert.equal(plan.billingType, "one_time");
  assert.equal(plan.totalAmount, 1000);
  assert.equal(plan.monthlyPaymentCount, null);
  assert.equal(plan.monthlyPaymentAmount, null);
  assert.equal(plan.status, "active");
});

test("creates a monthly_plan pricing plan and the backend computes total_amount", async () => {
  const plan = await createPricingPlan(
    db,
    baseMonthlyPayload({
      name: "Plano mensal (cálculo backend)",
      // Um total_amount deliberadamente errado no payload -- o
      // backend nunca pode confiar nele para monthly_plan.
      total_amount: 1,
    })
  );

  createdPlanIds.push(plan.id);

  assert.equal(plan.monthlyPaymentCount, 6);
  assert.equal(plan.monthlyPaymentAmount, 280);
  assert.equal(plan.totalAmount, 1680); // 6 * 280, nunca o "1" enviado
});

test("requires at least one payment method", async () => {
  await assert.rejects(
    () =>
      createPricingPlan(
        db,
        baseOneTimePayload({
          name: "Sem forma de pagamento",
          accepts_pix: false,
          accepts_boleto: false,
          accepts_credit_card: false,
        })
      ),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    }
  );
});

test("rejects a plan for a course that does not exist", async () => {
  await assert.rejects(
    () => createPricingPlan(db, baseOneTimePayload({ course_id: 999999999, name: "Curso inexistente" })),
    (error) => {
      assert.equal(error.statusCode, 404);
      return true;
    }
  );
});

test("rejects a duplicate plan name within the same course", async () => {
  const first = await createPricingPlan(db, baseOneTimePayload({ name: "Nome Duplicado" }));

  createdPlanIds.push(first.id);

  await assert.rejects(
    () => createPricingPlan(db, baseOneTimePayload({ name: "Nome Duplicado" })),
    (error) => {
      assert.equal(error.statusCode, 409);
      return true;
    }
  );
});

test("validates card installments between 1 and 12 when credit card is accepted", async () => {
  await assert.rejects(
    () =>
      createPricingPlan(
        db,
        baseOneTimePayload({
          name: "Cartão parcelamento inválido",
          accepts_credit_card: true,
          max_card_installments: 15,
        })
      ),
    (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    }
  );
});

// -----------------------------------------------------------------
// Listagem, edição, ativação/inativação
// -----------------------------------------------------------------

test("lists plans with search, course, billingType, and status filters", async () => {
  const plan = await createPricingPlan(db, baseOneTimePayload({ name: "Plano Listagem Teste" }));

  createdPlanIds.push(plan.id);

  const result = await listPricingPlans(db, {
    search: "Listagem Teste",
    courseId: courseAId,
    billingType: "one_time",
    status: "active",
    page: 1,
    limit: 10,
  });

  assert.ok(result.data.some((row) => row.id === plan.id));
  assert.equal(result.pagination.page, 1);
  assert.ok(result.pagination.total >= 1);
});

test("updates a plan's data", async () => {
  const plan = await createPricingPlan(db, baseOneTimePayload({ name: "Plano Para Editar" }));

  createdPlanIds.push(plan.id);

  const updated = await updatePricingPlan(db, plan.id, baseOneTimePayload({
    name: "Plano Editado",
    total_amount: 2000,
  }));

  assert.equal(updated.name, "Plano Editado");
  assert.equal(updated.totalAmount, 2000);

  const reloaded = await getPricingPlanById(db, plan.id);
  assert.equal(reloaded.name, "Plano Editado");
});

test("editing a plan never changes an existing contract's snapshot", async () => {
  const plan = await createPricingPlan(
    db,
    baseOneTimePayload({ name: "Plano Com Contrato", total_amount: 500 })
  );

  createdPlanIds.push(plan.id);

  const enrollment = await createEnrollment(db, {
    student_id: STUDENT_ID,
    course_id: courseAId,
    pricing_plan_id: plan.id,
  });

  createdEnrollmentIds.push(enrollment.id);

  const [[contractBefore]] = await db
    .promise()
    .query(`SELECT plan_name, total_amount FROM financial_contracts WHERE enrollment_id = ?`, [enrollment.id]);

  assert.equal(contractBefore.plan_name, "Plano Com Contrato");
  assert.equal(Number(contractBefore.total_amount), 500);

  await updatePricingPlan(db, plan.id, baseOneTimePayload({ name: "Plano Renomeado Depois", total_amount: 9999 }));

  const [[contractAfter]] = await db
    .promise()
    .query(`SELECT plan_name, total_amount FROM financial_contracts WHERE enrollment_id = ?`, [enrollment.id]);

  // O contrato mantém o snapshot original -- editar o plano nunca
  // reescreve financial_contracts.
  assert.equal(contractAfter.plan_name, "Plano Com Contrato");
  assert.equal(Number(contractAfter.total_amount), 500);
});

test("activates and inactivates a plan", async () => {
  const plan = await createPricingPlan(db, baseOneTimePayload({ name: "Plano Ativar Inativar" }));

  createdPlanIds.push(plan.id);

  const inactivated = await updatePricingPlanStatus(db, plan.id, "inactive");
  assert.equal(inactivated.status, "inactive");

  const reactivated = await updatePricingPlanStatus(db, plan.id, "active");
  assert.equal(reactivated.status, "active");
});

test("'delete' inactivates the plan instead of removing it", async () => {
  const plan = await createPricingPlan(db, baseOneTimePayload({ name: "Plano Excluir" }));

  createdPlanIds.push(plan.id);

  const deleted = await deletePricingPlan(db, plan.id);
  assert.equal(deleted.status, "inactive");

  const [[row]] = await db.promise().query(`SELECT id, status FROM course_pricing_plans WHERE id = ?`, [plan.id]);

  // Ainda existe no banco -- soft delete, nunca DELETE físico.
  assert.ok(row);
  assert.equal(row.status, "inactive");
});

// -----------------------------------------------------------------
// Integração com matrícula/contratos
// -----------------------------------------------------------------

test("enrollment is rejected when the pricing plan is inactive", async () => {
  const plan = await createPricingPlan(db, baseOneTimePayload({ name: "Plano Inativo Matricula" }));

  createdPlanIds.push(plan.id);

  await updatePricingPlanStatus(db, plan.id, "inactive");

  await assert.rejects(
    () =>
      createEnrollment(db, {
        student_id: STUDENT_ID,
        course_id: courseAId,
        pricing_plan_id: plan.id,
      }),
    (error) => {
      assert.equal(error.statusCode, 409);
      return true;
    }
  );
});

test("enrollment is rejected when the pricing plan belongs to a different course", async () => {
  const planForCourseB = await createPricingPlan(
    db,
    baseOneTimePayload({ course_id: courseBId, name: "Plano Do Curso B" })
  );

  createdPlanIds.push(planForCourseB.id);

  await assert.rejects(
    () =>
      createEnrollment(db, {
        student_id: STUDENT_ID,
        course_id: courseAId,
        pricing_plan_id: planForCourseB.id,
      }),
    (error) => {
      assert.equal(error.statusCode, 409);
      return true;
    }
  );
});

// -----------------------------------------------------------------
// Precificação (coursePricingService)
// -----------------------------------------------------------------

test("pricing summary picks the lowest total among active plans", async () => {
  const cheaper = await createPricingPlan(db, baseOneTimePayload({ name: "Barato", total_amount: 800 }));
  const pricier = await createPricingPlan(db, baseOneTimePayload({ name: "Caro", total_amount: 1500 }));

  createdPlanIds.push(cheaper.id, pricier.id);

  const summary = await getPricingSummaryForCourse(db, courseAId);

  assert.equal(summary.hasActivePlans, true);
  assert.equal(summary.startingPrice, 800);
});

test("pricing summary picks the lowest monthly payment among active monthly plans, ignoring one_time plans", async () => {
  const monthlyExpensive = await createPricingPlan(
    db,
    baseMonthlyPayload({ name: "Mensal Caro", monthly_payment_count: 10, monthly_payment_amount: 500 })
  );

  const monthlyCheap = await createPricingPlan(
    db,
    baseMonthlyPayload({ name: "Mensal Barato", monthly_payment_count: 4, monthly_payment_amount: 100 })
  );

  createdPlanIds.push(monthlyExpensive.id, monthlyCheap.id);

  const summary = await getPricingSummaryForCourse(db, courseAId);

  assert.equal(summary.monthlyPaymentFrom, 100);
});

test("inactive plans are ignored by the pricing summary", async () => {
  // Precisa de um curso só seu -- courseA/courseB já acumularam
  // outros planos ativos de testes anteriores neste arquivo, então
  // reaproveitá-los aqui não provaria nada sobre o plano inativado
  // especificamente.
  const isolatedCourseName = `TEST PRICING COURSE ISOLATED ${Date.now()}`;
  const isolatedCourseId = await createTestCourse(isolatedCourseName);

  try {
    const onlyPlan = await createPricingPlan(
      db,
      baseOneTimePayload({ course_id: isolatedCourseId, name: "Único Plano Isolado", total_amount: 700 })
    );

    const summaryWithPlan = await getPricingSummaryForCourse(db, isolatedCourseId);
    assert.equal(summaryWithPlan.hasActivePlans, true);

    await updatePricingPlanStatus(db, onlyPlan.id, "inactive");

    const summaryWithoutActivePlan = await getPricingSummaryForCourse(db, isolatedCourseId);

    assert.equal(summaryWithoutActivePlan.hasActivePlans, false);
    assert.equal(summaryWithoutActivePlan.activePlanCount, 0);
    assert.equal(summaryWithoutActivePlan.startingPrice, null);
    assert.equal(summaryWithoutActivePlan.monthlyPaymentFrom, null);
  } finally {
    await db.promise().query(`DELETE FROM course_pricing_plans WHERE course_id = ?`, [isolatedCourseId]);
    await db.promise().query(`DELETE FROM courses WHERE id = ?`, [isolatedCourseId]);
  }
});

test("a course with no pricing plan at all returns hasActivePlans: false", async () => {
  const untouchedCourseName = `TEST PRICING COURSE C ${Date.now()}`;
  const emptyCourseId = await createTestCourse(untouchedCourseName);

  try {
    const summary = await getPricingSummaryForCourse(db, emptyCourseId);

    assert.deepEqual(summary, {
      hasActivePlans: false,
      activePlanCount: 0,
      startingPrice: null,
      monthlyPaymentFrom: null,
    });
  } finally {
    await db.promise().query(`DELETE FROM courses WHERE id = ?`, [emptyCourseId]);
  }
});

test("attachPricingToCourses resolves pricing for many courses in a single batch query (no N+1)", async () => {
  const originalQuery = db.promise().query.bind(db.promise());
  let queryCount = 0;

  const dbSpy = {
    promise: () => ({
      query: (...args) => {
        queryCount += 1;
        return originalQuery(...args);
      },
    }),
  };

  const courses = await attachPricingToCourses(dbSpy, [{ id: courseAId }, { id: courseBId }]);

  assert.equal(queryCount, 1, "expected exactly one batched query regardless of course count");
  assert.equal(courses.length, 2);
  assert.ok(courses.every((course) => course.pricing !== undefined));
});

// -----------------------------------------------------------------
// Seed idempotente
// -----------------------------------------------------------------

// O pool compartilhado (backend/db.js) não habilita
// `multipleStatements` (por design -- é uma superfície de SQL
// injection desnecessária no resto da aplicação), então o arquivo de
// seed real (múltiplas instruções separadas por ";") precisa ser
// dividido e executado uma instrução por vez aqui. Isso testa o
// arquivo de seed de produção de verdade, não uma cópia da lógica.
function splitSqlStatements(sql) {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

test("the pricing plan seed can be executed twice without duplicating rows", async () => {
  const seedPath = path.join(
    __dirname,
    "..",
    "..",
    "..",
    "..",
    "database",
    "seeds",
    "20260813_001_seed_course_pricing_plans.sql"
  );
  const statements = splitSqlStatements(fs.readFileSync(seedPath, "utf8"));

  async function runSeed() {
    for (const statement of statements) {
      await db.promise().query(statement);
    }
  }

  const [[before]] = await db.promise().query(`SELECT COUNT(*) AS n FROM course_pricing_plans`);

  await runSeed();
  const [[afterFirstRun]] = await db.promise().query(`SELECT COUNT(*) AS n FROM course_pricing_plans`);

  await runSeed();
  const [[afterSecondRun]] = await db.promise().query(`SELECT COUNT(*) AS n FROM course_pricing_plans`);

  // A primeira execução pode ou não inserir linhas (depende se o
  // ambiente já rodou o seed antes) -- o que importa é que a SEGUNDA
  // execução nunca adiciona nada além do que a primeira já garantiu.
  assert.equal(afterSecondRun.n, afterFirstRun.n);
  assert.ok(afterFirstRun.n >= before.n);
});
