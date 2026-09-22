const ALLOWED_STATUSES = ["new", "read", "resolved"];

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
  const normalizedPage = Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : DEFAULT_PAGE;

  const normalizedLimit =
    Number.isInteger(Number(limit)) && Number(limit) > 0 ? Math.min(Number(limit), MAX_LIMIT) : DEFAULT_LIMIT;

  return { page: normalizedPage, limit: normalizedLimit, offset: (normalizedPage - 1) * normalizedLimit };
}

function mapContactRequestRow(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    subject: row.subject,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Listagem administrativa simples (/admin/contatos) -- sem
 * atribuição, sem thread, só status + busca por nome/e-mail/assunto.
 */
async function listContactRequests(db, filters = {}) {
  const conditions = [];
  const params = [];

  if (filters.status) {
    if (!ALLOWED_STATUSES.includes(filters.status)) {
      throw createServiceError("Status inválido.", 400);
    }

    conditions.push("status = ?");
    params.push(filters.status);
  }

  if (filters.search) {
    conditions.push("(name LIKE ? OR email LIKE ? OR subject LIKE ?)");
    const likeValue = `%${filters.search.trim()}%`;
    params.push(likeValue, likeValue, likeValue);
  }

  const whereClause = conditions.length > 0 ? conditions.join(" AND ") : "1 = 1";
  const { page, limit, offset } = normalizePagination(filters.page, filters.limit);

  const [[countRows], [rows]] = await Promise.all([
    db.promise().query(`SELECT COUNT(*) AS total FROM public_contact_requests WHERE ${whereClause}`, params),
    db.promise().query(
      `
        SELECT id, name, email, phone, subject, message, status, created_at, updated_at
        FROM public_contact_requests
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    ),
  ]);

  const total = Number(countRows[0]?.total || 0);

  return {
    data: rows.map(mapContactRequestRow),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    },
  };
}

async function getContactRequestById(db, id) {
  const normalizedId = normalizeId(id, "ID do contato inválido.");

  const [rows] = await db
    .promise()
    .query(
      `SELECT id, name, email, phone, subject, message, status, created_at, updated_at FROM public_contact_requests WHERE id = ? LIMIT 1`,
      [normalizedId]
    );

  if (rows.length === 0) {
    throw createServiceError("Contato não encontrado.", 404);
  }

  return mapContactRequestRow(rows[0]);
}

/**
 * "Marcar como lido/resolvido" -- transição simples, sem máquina de
 * estados: qualquer status permitido pode ser setado a qualquer
 * momento (não há um fluxo obrigatório new -> read -> resolved).
 */
async function updateContactRequestStatus(db, id, status) {
  const normalizedId = normalizeId(id, "ID do contato inválido.");

  if (!ALLOWED_STATUSES.includes(status)) {
    throw createServiceError(`Status inválido. Utilize um de: ${ALLOWED_STATUSES.join(", ")}.`, 400);
  }

  const [result] = await db
    .promise()
    .query(`UPDATE public_contact_requests SET status = ?, updated_at = NOW() WHERE id = ?`, [status, normalizedId]);

  if (result.affectedRows === 0) {
    throw createServiceError("Contato não encontrado.", 404);
  }

  return getContactRequestById(db, normalizedId);
}

module.exports = {
  createServiceError,
  ALLOWED_STATUSES,
  listContactRequests,
  getContactRequestById,
  updateContactRequestStatus,
};
