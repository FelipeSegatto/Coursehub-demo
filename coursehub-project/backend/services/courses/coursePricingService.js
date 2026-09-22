/**
 * Única fonte de precificação comercial derivada de
 * course_pricing_plans. Reaproveitado por todo mundo que precisa
 * mostrar ou consultar preço de curso -- listagem/detalhe públicos,
 * listagem/detalhe administrativos, endpoint de planos ativos por
 * curso (público e admin) -- para nunca existir uma segunda
 * implementação divergente da mesma regra (ver seção 2 do briefing:
 * "não mantenha duas implementações diferentes das mesmas regras").
 *
 * courses.price nunca é lido aqui. Este módulo é a única fonte
 * oficial de preço comercial da aplicação.
 */

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

function emptyPricingSummary() {
  return {
    hasActivePlans: false,
    activePlanCount: 0,
    startingPrice: null,
    monthlyPaymentFrom: null,
  };
}

function normalizeCourseIds(courseIds) {
  return [...new Set((courseIds || []).map(Number))].filter(
    (id) => Number.isInteger(id) && id > 0
  );
}

/**
 * Resumo de precificação em lote -- uma única query agrupada para
 * qualquer quantidade de cursos, nunca uma consulta por curso (ver
 * seção 1: "Use consultas em lote... Não faça uma consulta de planos
 * para cada curso"). Cursos sem nenhum plano ativo simplesmente não
 * aparecem no resultado agrupado; o chamador preenche o resumo vazio
 * para eles.
 */
async function getPricingSummaryByCourseIds(db, courseIds) {
  const normalizedCourseIds = normalizeCourseIds(courseIds);

  if (normalizedCourseIds.length === 0) {
    return new Map();
  }

  const placeholders = normalizedCourseIds.map(() => "?").join(",");

  const [rows] = await db.promise().query(
    `
      SELECT
        course_id,
        COUNT(*) AS active_plan_count,
        MIN(total_amount) AS starting_price,
        MIN(
          CASE
            WHEN billing_type = 'monthly_plan'
            THEN monthly_payment_amount
            ELSE NULL
          END
        ) AS monthly_payment_from
      FROM course_pricing_plans
      WHERE status = 'active' AND course_id IN (${placeholders})
      GROUP BY course_id
    `,
    normalizedCourseIds
  );

  const summaryByCourseId = new Map();

  for (const row of rows) {
    summaryByCourseId.set(Number(row.course_id), {
      hasActivePlans: true,
      activePlanCount: Number(row.active_plan_count),
      startingPrice: row.starting_price !== null ? Number(row.starting_price) : null,
      monthlyPaymentFrom:
        row.monthly_payment_from !== null ? Number(row.monthly_payment_from) : null,
    });
  }

  return summaryByCourseId;
}

/**
 * Anexa `.pricing` a uma lista de cursos já carregada, em uma única
 * query em lote adicional (nunca N+1). Cada curso precisa ter `.id`.
 */
async function attachPricingToCourses(db, courses) {
  if (!Array.isArray(courses) || courses.length === 0) {
    return courses || [];
  }

  const summaryByCourseId = await getPricingSummaryByCourseIds(
    db,
    courses.map((course) => course.id)
  );

  return courses.map((course) => ({
    ...course,
    pricing: summaryByCourseId.get(Number(course.id)) || emptyPricingSummary(),
  }));
}

/** Conveniência para um único curso (detalhe). */
async function getPricingSummaryForCourse(db, courseId) {
  const normalizedCourseId = Number(courseId);

  if (!Number.isInteger(normalizedCourseId) || normalizedCourseId <= 0) {
    throw createServiceError("ID do curso inválido.", 400);
  }

  const summaryByCourseId = await getPricingSummaryByCourseIds(db, [normalizedCourseId]);

  return summaryByCourseId.get(normalizedCourseId) || emptyPricingSummary();
}

/**
 * Planos ATIVOS de um curso, do mais barato ao mais caro. Usado pela
 * criação de matrícula (admin escolhe o plano que vira contrato),
 * pelo endpoint administrativo de planos por curso e pelo endpoint
 * público equivalente -- os três reaproveitam esta mesma função, cada
 * um decidindo por conta própria quais campos do retorno expor.
 */
async function listActivePlansForCourse(db, courseId) {
  const normalizedCourseId = Number(courseId);

  if (!Number.isInteger(normalizedCourseId) || normalizedCourseId <= 0) {
    throw createServiceError("ID do curso inválido.", 400);
  }

  const [rows] = await db.promise().query(
    `
      SELECT
        id, course_id, name, description, billing_type, total_amount,
        monthly_payment_count, monthly_payment_amount, max_card_installments,
        accepts_pix, accepts_boleto, accepts_credit_card, status
      FROM course_pricing_plans
      WHERE course_id = ? AND status = 'active'
      ORDER BY total_amount ASC
    `,
    [normalizedCourseId]
  );

  return rows;
}

module.exports = {
  createServiceError,
  emptyPricingSummary,
  getPricingSummaryByCourseIds,
  attachPricingToCourses,
  getPricingSummaryForCourse,
  listActivePlansForCourse,
};
