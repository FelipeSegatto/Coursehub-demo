/**
 * Exporta a listagem de faturas financeiras (mesma tela/filtros de
 * GET /api/admin/financial/invoices) como PDF. Reaproveita
 * listFinancialInvoices diretamente -- mesmas validações de filtro,
 * mesma ordenação -- em vez de duplicar a consulta. Totais são
 * calculados aqui, sobre o próprio conjunto filtrado (não sobre
 * getFinancialDashboardSummary, que é global/sem filtro e mostraria
 * números que não batem com o que a tela exibiu).
 */
const { listFinancialInvoices } = require("../financial/adminFinancialReadService");
const { renderHtmlToPdf } = require("../documents/documentRendererService");
const { fetchAllFilteredRows, getRequesterName, DEFAULT_ROW_CAP } = require("./reportDataHelpers");
const financialInvoicesReportTemplate = require("./templates/financialInvoicesReportTemplate");

const STATUS_LABEL = {
  pending: "Em aberto",
  processing: "Processando",
  paid: "Paga",
  overdue: "Vencida",
  cancelled: "Cancelada",
  refunded: "Reembolsada",
};

function buildFilterLines(filters) {
  const lines = [];

  if (filters.status) lines.push(`Status: ${STATUS_LABEL[filters.status] || filters.status}`);
  if (filters.contractId) lines.push(`Contrato: #${filters.contractId}`);
  if (filters.dueFrom || filters.dueTo) {
    lines.push(`Vencimento: ${filters.dueFrom || "início"} a ${filters.dueTo || "hoje"}`);
  }
  if (filters.search) lines.push(`Busca: "${filters.search}"`);

  return lines;
}

/**
 * @param {object} db
 * @param {object} params
 * @param {object} params.filters - {status, contractId, dueFrom, dueTo, search}
 * @param {number} params.actorUserId
 */
async function generateFinancialInvoicesReportPdf(db, { filters = {}, actorUserId }) {
  const rowCap = DEFAULT_ROW_CAP;

  const [{ rows: invoices }, requestedByName] = await Promise.all([
    fetchAllFilteredRows(listFinancialInvoices, db, filters, { rowCap, dataKey: "invoices" }),
    getRequesterName(db, actorUserId),
  ]);

  const generatedAt = new Date();

  const html = financialInvoicesReportTemplate.render({
    invoices,
    filterLines: buildFilterLines(filters),
    requestedByName,
    generatedAt,
    rowCap,
  });

  const buffer = await renderHtmlToPdf(html);

  return {
    buffer,
    filename: `relatorio-financeiro-faturas-${generatedAt.toISOString().slice(0, 10)}.pdf`,
  };
}

module.exports = { generateFinancialInvoicesReportPdf };
