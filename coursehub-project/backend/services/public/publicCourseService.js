const {
  attachPricingToCourses,
  getPricingSummaryForCourse,
  listActivePlansForCourse,
} = require("../courses/coursePricingService");

/**
 * Cria um erro de negócio com status HTTP associado.
 */
function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

/**
 * Lista cursos ativos (rota pública).
 *
 * courses.price nunca é selecionado aqui -- desde a reformulação de
 * precificação, course_pricing_plans é a única fonte de preço
 * comercial. `pricing` é anexado em lote (uma única query agrupada
 * para todos os cursos da página, nunca uma consulta por curso).
 */
async function assertPublicCourse(db, courseId) {
  const [rows] = await db.promise().query(
    `SELECT id FROM courses WHERE id = ? AND status = 'active' LIMIT 1`,
    [courseId]
  );

  if (rows.length === 0) {
    throw createServiceError("Curso não encontrado.", 404);
  }
}

async function listCourses(db) {
  const [rows] = await db.promise().query(
    `
    SELECT
      id, teacher_id, name, description, expanded_description,
      workload_hours, image_url, nivel, syllabus, category,
      status, created_at, updated_at
    FROM courses
    WHERE status = 'active'
    ORDER BY name ASC
    `
  );

  return attachPricingToCourses(db, rows);
}

/**
 * Busca os detalhes de um curso pelo ID (rota pública).
 */
async function getCourseById(db, courseId) {
  const normalizedId = Number(courseId);

  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    throw createServiceError("ID do curso inválido.", 400);
  }

  const [rows] = await db.promise().query(
    `
    SELECT
      id,
      teacher_id,
      name,
      description,
      expanded_description,
      workload_hours,
      image_url,
      nivel,
      syllabus,
      category,
      status
    FROM courses
    WHERE id = ?
      AND status = 'active'
    LIMIT 1
    `,
    [normalizedId]
  );

  if (rows.length === 0) {
    throw createServiceError("Curso não encontrado.", 404);
  }

  return {
    ...rows[0],
    pricing: await getPricingSummaryForCourse(db, normalizedId),
  };
}

/**
 * Planos ativos de um curso, somente com os campos seguros para uma
 * rota pública (sem status/timestamps internos) -- reaproveita a
 * mesma consulta que a listagem administrativa usa, via
 * coursePricingService, nunca uma segunda implementação da regra.
 */
async function getActivePricingPlans(db, courseId) {
  const normalizedId = Number(courseId);

  if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
    throw createServiceError("ID do curso inválido.", 400);
  }

  await assertPublicCourse(db, normalizedId);

  const plans = await listActivePlansForCourse(db, normalizedId);

  return plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    description: plan.description,
    billingType: plan.billing_type,
    totalAmount: Number(plan.total_amount),
    monthlyPaymentCount: plan.monthly_payment_count,
    monthlyPaymentAmount:
      plan.monthly_payment_amount !== null ? Number(plan.monthly_payment_amount) : null,
    maxCardInstallments: plan.max_card_installments,
    acceptsPix: Boolean(plan.accepts_pix),
    acceptsBoleto: Boolean(plan.accepts_boleto),
    acceptsCreditCard: Boolean(plan.accepts_credit_card),
  }));
}

module.exports = {
  createServiceError,
  assertPublicCourse,
  listCourses,
  getCourseById,
  getActivePricingPlans,
};
