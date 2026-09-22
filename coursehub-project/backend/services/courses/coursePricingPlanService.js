/**
 * CRUD administrativo de planos comerciais (course_pricing_plans).
 * Editar/inativar um plano nunca afeta financial_contracts já
 * criados -- eles guardam seu próprio snapshot (billing_type,
 * plan_name, total_amount, ...) copiado no momento da matrícula
 * (ver adminEnrollmentService#createEnrollment), e este service nunca
 * escreve em financial_contracts.
 */
const ALLOWED_BILLING_TYPES = ["one_time", "monthly_plan"];
const ALLOWED_STATUSES = ["active", "inactive"];
const MAX_NAME_LENGTH = 100;
const MIN_CARD_INSTALLMENTS = 1;
const MAX_CARD_INSTALLMENTS = 12;

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

function normalizeId(value, message) {
  const normalized = Number(value);

  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw createServiceError(message, 400);
  }

  return normalized;
}

function normalizePagination(page, limit) {
  const normalizedPage =
    Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : DEFAULT_PAGE;

  const normalizedLimit =
    Number.isInteger(Number(limit)) && Number(limit) > 0
      ? Math.min(Number(limit), MAX_LIMIT)
      : DEFAULT_LIMIT;

  return {
    page: normalizedPage,
    limit: normalizedLimit,
    offset: (normalizedPage - 1) * normalizedLimit,
  };
}

function mapPlanRow(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    courseName: row.course_name,
    name: row.name,
    description: row.description,
    billingType: row.billing_type,
    totalAmount: Number(row.total_amount),
    monthlyPaymentCount: row.monthly_payment_count,
    monthlyPaymentAmount:
      row.monthly_payment_amount !== null ? Number(row.monthly_payment_amount) : null,
    maxCardInstallments: row.max_card_installments,
    acceptsPix: Boolean(row.accepts_pix),
    acceptsBoleto: Boolean(row.accepts_boleto),
    acceptsCreditCard: Boolean(row.accepts_credit_card),
    status: row.status,
    contractCount: Number(row.contract_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const BASE_QUERY = `
  FROM course_pricing_plans p
  INNER JOIN courses c ON c.id = p.course_id
  LEFT JOIN (
    SELECT pricing_plan_id, COUNT(*) AS total
    FROM financial_contracts
    GROUP BY pricing_plan_id
  ) fc ON fc.pricing_plan_id = p.id
`;

const SELECT_COLUMNS = `
  p.id, p.course_id, c.name AS course_name, p.name, p.description, p.billing_type,
  p.total_amount, p.monthly_payment_count, p.monthly_payment_amount,
  p.max_card_installments, p.accepts_pix, p.accepts_boleto, p.accepts_credit_card,
  p.status, p.created_at, p.updated_at,
  COALESCE(fc.total, 0) AS contract_count
`;

function buildListFilters(filters) {
  const conditions = ["1 = 1"];
  const params = [];

  const search = filters.search?.trim();

  if (search) {
    conditions.push("(p.name LIKE ? OR c.name LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  if (filters.courseId) {
    const courseId = normalizeId(filters.courseId, "ID do curso inválido.");

    conditions.push("p.course_id = ?");
    params.push(courseId);
  }

  if (filters.billingType) {
    if (!ALLOWED_BILLING_TYPES.includes(filters.billingType)) {
      throw createServiceError("Tipo de cobrança inválido.", 400);
    }

    conditions.push("p.billing_type = ?");
    params.push(filters.billingType);
  }

  if (filters.status) {
    if (!ALLOWED_STATUSES.includes(filters.status)) {
      throw createServiceError("Status inválido.", 400);
    }

    conditions.push("p.status = ?");
    params.push(filters.status);
  }

  return { whereClause: conditions.join(" AND "), params };
}

/**
 * Lista planos comerciais com filtros e paginação -- mesmo padrão de
 * adminUserService#listUsers (contagem total em paralelo com a
 * página de resultados).
 */
async function listPricingPlans(db, filters = {}) {
  const { whereClause, params } = buildListFilters(filters);
  const { page, limit, offset } = normalizePagination(filters.page, filters.limit);

  const [[countRows], [rows]] = await Promise.all([
    db.promise().query(`SELECT COUNT(*) AS total ${BASE_QUERY} WHERE ${whereClause}`, params),
    db.promise().query(
      `
        SELECT ${SELECT_COLUMNS}
        ${BASE_QUERY}
        WHERE ${whereClause}
        ORDER BY c.name ASC, p.name ASC
        LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    ),
  ]);

  const total = Number(countRows[0]?.total || 0);

  return {
    data: rows.map(mapPlanRow),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  };
}

async function getPricingPlanById(db, planId) {
  const normalizedId = normalizeId(planId, "ID do plano comercial inválido.");

  const [rows] = await db
    .promise()
    .query(`SELECT ${SELECT_COLUMNS} ${BASE_QUERY} WHERE p.id = ? LIMIT 1`, [normalizedId]);

  if (rows.length === 0) {
    throw createServiceError("Plano comercial não encontrado.", 404);
  }

  return mapPlanRow(rows[0]);
}

/**
 * Valida e normaliza o payload de criação/edição. O backend é a
 * única autoridade sobre o valor total de um plano mensal -- nunca
 * confia em um total_amount vindo do cliente quando billing_type é
 * "monthly_plan"; ele é sempre recalculado aqui como
 * monthly_payment_count × monthly_payment_amount.
 */
function normalizeAndValidatePayload(payload) {
  const {
    course_id,
    name,
    description,
    billing_type,
    total_amount,
    monthly_payment_count,
    monthly_payment_amount,
    max_card_installments,
    accepts_pix,
    accepts_boleto,
    accepts_credit_card,
    status,
  } = payload || {};

  const courseId = normalizeId(course_id, "Curso é obrigatório e deve ser válido.");

  const trimmedName = name?.trim();

  if (!trimmedName) {
    throw createServiceError("O nome do plano é obrigatório.", 400);
  }

  if (trimmedName.length > MAX_NAME_LENGTH) {
    throw createServiceError(
      `O nome do plano deve ter no máximo ${MAX_NAME_LENGTH} caracteres.`,
      400
    );
  }

  if (!ALLOWED_BILLING_TYPES.includes(billing_type)) {
    throw createServiceError(
      "Tipo de cobrança inválido. Utilize one_time ou monthly_plan.",
      400
    );
  }

  const acceptsPix = Boolean(accepts_pix);
  const acceptsBoleto = Boolean(accepts_boleto);
  const acceptsCreditCard = Boolean(accepts_credit_card);

  if (!acceptsPix && !acceptsBoleto && !acceptsCreditCard) {
    throw createServiceError("Selecione ao menos uma forma de pagamento.", 400);
  }

  let normalizedMaxCardInstallments = MIN_CARD_INSTALLMENTS;

  if (acceptsCreditCard) {
    normalizedMaxCardInstallments = Number(max_card_installments);

    if (
      !Number.isInteger(normalizedMaxCardInstallments) ||
      normalizedMaxCardInstallments < MIN_CARD_INSTALLMENTS ||
      normalizedMaxCardInstallments > MAX_CARD_INSTALLMENTS
    ) {
      throw createServiceError(
        `O parcelamento no cartão deve ser um número inteiro entre ${MIN_CARD_INSTALLMENTS} e ${MAX_CARD_INSTALLMENTS}.`,
        400
      );
    }
  }

  let normalizedTotalAmount;
  let normalizedMonthlyCount = null;
  let normalizedMonthlyAmount = null;

  if (billing_type === "one_time") {
    normalizedTotalAmount = Number(total_amount);

    if (!Number.isFinite(normalizedTotalAmount) || normalizedTotalAmount <= 0) {
      throw createServiceError("O valor total deve ser maior que zero.", 400);
    }

    // Em one_time, os campos mensais ficam NULL -- nunca herdados de
    // um payload malformado.
    normalizedMonthlyCount = null;
    normalizedMonthlyAmount = null;
  } else {
    normalizedMonthlyCount = Number(monthly_payment_count);
    normalizedMonthlyAmount = Number(monthly_payment_amount);

    if (!Number.isInteger(normalizedMonthlyCount) || normalizedMonthlyCount <= 0) {
      throw createServiceError(
        "A quantidade de mensalidades é obrigatória e deve ser maior que zero.",
        400
      );
    }

    if (!Number.isFinite(normalizedMonthlyAmount) || normalizedMonthlyAmount <= 0) {
      throw createServiceError(
        "O valor da mensalidade é obrigatório e deve ser maior que zero.",
        400
      );
    }

    // Fonte da verdade do total é o backend: quantidade × mensalidade,
    // calculado em centavos para evitar erro de ponto flutuante --
    // nunca o total_amount que o cliente eventualmente tenha enviado.
    const monthlyAmountCents = Math.round(normalizedMonthlyAmount * 100);
    normalizedTotalAmount = (normalizedMonthlyCount * monthlyAmountCents) / 100;
  }

  const normalizedStatus = status || "active";

  if (!ALLOWED_STATUSES.includes(normalizedStatus)) {
    throw createServiceError("Status inválido.", 400);
  }

  return {
    courseId,
    name: trimmedName,
    description: description?.trim() || null,
    billingType: billing_type,
    totalAmount: normalizedTotalAmount,
    monthlyPaymentCount: normalizedMonthlyCount,
    monthlyPaymentAmount: normalizedMonthlyAmount,
    maxCardInstallments: normalizedMaxCardInstallments,
    acceptsPix,
    acceptsBoleto,
    acceptsCreditCard,
    status: normalizedStatus,
  };
}

async function assertCourseExists(connection, courseId) {
  const [rows] = await connection.query(`SELECT id FROM courses WHERE id = ? LIMIT 1`, [
    courseId,
  ]);

  if (rows.length === 0) {
    throw createServiceError("Curso não encontrado.", 404);
  }
}

async function assertNameNotDuplicated(connection, { courseId, name, excludingPlanId = null }) {
  const params = [courseId, name];
  let query = `SELECT id FROM course_pricing_plans WHERE course_id = ? AND name = ?`;

  if (excludingPlanId) {
    query += ` AND id <> ?`;
    params.push(excludingPlanId);
  }

  const [rows] = await connection.query(`${query} LIMIT 1`, params);

  if (rows.length > 0) {
    throw createServiceError("Já existe um plano com este nome para este curso.", 409);
  }
}

/**
 * Cria um novo plano comercial. Não afeta nenhum contrato existente
 * -- é uma linha nova, os contratos já criados nunca leem
 * course_pricing_plans de volta (o snapshot já está copiado neles).
 */
async function createPricingPlan(db, payload) {
  const normalized = normalizeAndValidatePayload(payload);

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    await assertCourseExists(connection, normalized.courseId);
    await assertNameNotDuplicated(connection, {
      courseId: normalized.courseId,
      name: normalized.name,
    });

    const [result] = await connection.query(
      `
        INSERT INTO course_pricing_plans
          (course_id, name, description, billing_type, total_amount, monthly_payment_count,
           monthly_payment_amount, max_card_installments, accepts_pix, accepts_boleto,
           accepts_credit_card, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        normalized.courseId,
        normalized.name,
        normalized.description,
        normalized.billingType,
        normalized.totalAmount,
        normalized.monthlyPaymentCount,
        normalized.monthlyPaymentAmount,
        normalized.maxCardInstallments,
        normalized.acceptsPix ? 1 : 0,
        normalized.acceptsBoleto ? 1 : 0,
        normalized.acceptsCreditCard ? 1 : 0,
        normalized.status,
      ]
    );

    await connection.commit();

    return getPricingPlanById(db, result.insertId);
  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      throw createServiceError("Já existe um plano com este nome para este curso.", 409);
    }

    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Atualiza um plano existente. Isto NUNCA toca financial_contracts:
 * quem já contratou este plano mantém o snapshot copiado no momento
 * da matrícula, intacto -- só novas matrículas passam a enxergar os
 * valores atualizados (ver docstring do módulo).
 */
async function updatePricingPlan(db, planId, payload) {
  const normalizedPlanId = normalizeId(planId, "ID do plano comercial inválido.");
  const normalized = normalizeAndValidatePayload(payload);

  const connection = await db.promise().getConnection();

  try {
    await connection.beginTransaction();

    const [existingRows] = await connection.query(
      `SELECT id FROM course_pricing_plans WHERE id = ? LIMIT 1 FOR UPDATE`,
      [normalizedPlanId]
    );

    if (existingRows.length === 0) {
      throw createServiceError("Plano comercial não encontrado.", 404);
    }

    await assertCourseExists(connection, normalized.courseId);
    await assertNameNotDuplicated(connection, {
      courseId: normalized.courseId,
      name: normalized.name,
      excludingPlanId: normalizedPlanId,
    });

    await connection.query(
      `
        UPDATE course_pricing_plans
        SET
          course_id = ?, name = ?, description = ?, billing_type = ?, total_amount = ?,
          monthly_payment_count = ?, monthly_payment_amount = ?, max_card_installments = ?,
          accepts_pix = ?, accepts_boleto = ?, accepts_credit_card = ?, status = ?,
          updated_at = NOW()
        WHERE id = ?
      `,
      [
        normalized.courseId,
        normalized.name,
        normalized.description,
        normalized.billingType,
        normalized.totalAmount,
        normalized.monthlyPaymentCount,
        normalized.monthlyPaymentAmount,
        normalized.maxCardInstallments,
        normalized.acceptsPix ? 1 : 0,
        normalized.acceptsBoleto ? 1 : 0,
        normalized.acceptsCreditCard ? 1 : 0,
        normalized.status,
        normalizedPlanId,
      ]
    );

    await connection.commit();

    return getPricingPlanById(db, normalizedPlanId);
  } catch (error) {
    await connection.rollback();

    if (error.code === "ER_DUP_ENTRY") {
      throw createServiceError("Já existe um plano com este nome para este curso.", 409);
    }

    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Ativa/inativa um plano. "Excluir" um plano comercial (rota DELETE)
 * é um alias desta função com status='inactive' -- nunca um DELETE
 * físico, porque financial_contracts referencia pricing_plan_id e
 * contratos antigos precisam continuar resolvendo esse vínculo.
 */
async function updatePricingPlanStatus(db, planId, status) {
  const normalizedPlanId = normalizeId(planId, "ID do plano comercial inválido.");

  if (!ALLOWED_STATUSES.includes(status)) {
    throw createServiceError("Status inválido.", 400);
  }

  const [result] = await db
    .promise()
    .query(`UPDATE course_pricing_plans SET status = ?, updated_at = NOW() WHERE id = ?`, [
      status,
      normalizedPlanId,
    ]);

  if (result.affectedRows === 0) {
    throw createServiceError("Plano comercial não encontrado.", 404);
  }

  return getPricingPlanById(db, normalizedPlanId);
}

/** Alias semântico de updatePricingPlanStatus(db, planId, "inactive") -- ver docstring acima. */
async function deletePricingPlan(db, planId) {
  return updatePricingPlanStatus(db, planId, "inactive");
}

module.exports = {
  createServiceError,
  ALLOWED_BILLING_TYPES,
  ALLOWED_STATUSES,
  listPricingPlans,
  getPricingPlanById,
  createPricingPlan,
  updatePricingPlan,
  updatePricingPlanStatus,
  deletePricingPlan,
};
