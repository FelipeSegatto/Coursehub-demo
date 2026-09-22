/**
 * Helpers compartilhados pelos services de relatório
 * (backend/services/reports/*.js).
 *
 * Os quatro serviços de listagem admin reaproveitados aqui (financeiro,
 * matrículas, frequência, notas) capam `limit` internamente em 100 --
 * um relatório precisa de todas as linhas que batem com o filtro, não
 * paginadas, então este helper busca página por página até acumular
 * tudo ou estourar o teto do relatório. Acima do teto, falha cedo com
 * uma mensagem clara em vez de truncar silenciosamente: um total
 * calculado sobre um recorte truncado seria um total errado.
 */
const PAGE_SIZE = 100;
const DEFAULT_ROW_CAP = 2000;

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

/**
 * @param {Function} listFn - listX(db, filters) => Promise<{[dataKey]: rows, pagination: {total, totalPages}}>
 * @param {object} db
 * @param {object} filters
 * @param {object} options
 * @param {number} options.rowCap
 * @param {string} [options.dataKey="data"]
 */
async function fetchAllFilteredRows(listFn, db, filters, { rowCap, dataKey = "data" }) {
  const firstPage = await listFn(db, { ...filters, page: 1, limit: PAGE_SIZE });
  const total = Number(firstPage.pagination.total || 0);

  if (total > rowCap) {
    throw createServiceError(
      `O relatório encontrou ${total} registros para os filtros aplicados, acima do limite de ${rowCap} por exportação. Refine os filtros (período, curso, turma ou status) e tente novamente.`,
      413
    );
  }

  let rows = firstPage[dataKey];
  const totalPages = firstPage.pagination.totalPages;

  for (let page = 2; page <= totalPages; page += 1) {
    const pageResult = await listFn(db, { ...filters, page, limit: PAGE_SIZE });
    rows = rows.concat(pageResult[dataKey]);
  }

  return { rows, total };
}

async function getRequesterName(db, userId) {
  const [rows] = await db.promise().query("SELECT name FROM users WHERE id = ? LIMIT 1", [userId]);

  return rows[0]?.name || "Usuário não identificado";
}

module.exports = {
  fetchAllFilteredRows,
  getRequesterName,
  createServiceError,
  REPORT_PAGE_SIZE: PAGE_SIZE,
  DEFAULT_ROW_CAP,
};
