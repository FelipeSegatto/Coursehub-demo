const { escapeHtml, formatCurrency, formatDate } = require("../../documents/templateHelpers");
const { renderReportDocument } = require("../reportTemplateHelpers");

const STATUS_LABEL = {
  pending: "Em aberto",
  processing: "Processando",
  paid: "Paga",
  overdue: "Vencida",
  cancelled: "Cancelada",
  refunded: "Reembolsada",
};

/**
 * @param {object} params
 * @param {object[]} params.invoices - já no formato de listFinancialInvoices (amount normalizado)
 * @param {string[]} params.filterLines
 * @param {string} params.requestedByName
 * @param {Date} params.generatedAt
 * @param {number} params.rowCap
 */
function render({ invoices, filterLines, requestedByName, generatedAt, rowCap }) {
  const totalAmount = invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const receivedAmount = invoices
    .filter((invoice) => invoice.status === "paid")
    .reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const overdueAmount = invoices
    .filter((invoice) => invoice.status === "overdue")
    .reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
  const pendingAmount = invoices
    .filter((invoice) => invoice.status === "pending" || invoice.status === "processing")
    .reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);

  const tableHeadHtml = `
    <th>Fatura</th>
    <th>Descrição</th>
    <th>Plano</th>
    <th>Vencimento</th>
    <th>Status</th>
    <th>Valor</th>
  `;

  const tableBodyHtml = invoices
    .map(
      (invoice) => `
    <tr>
      <td>#${escapeHtml(String(invoice.id))}</td>
      <td>${escapeHtml(invoice.description || "")}</td>
      <td>${escapeHtml(invoice.planName || "")}</td>
      <td>${formatDate(invoice.dueDate)}</td>
      <td>${escapeHtml(STATUS_LABEL[invoice.status] || invoice.status)}</td>
      <td>${formatCurrency(invoice.amount)}</td>
    </tr>`
    )
    .join("");

  return renderReportDocument({
    title: "Relatório financeiro — faturas",
    filterLines,
    requestedByName,
    generatedAt,
    summaryCards: [
      { label: "Total de faturas", value: String(invoices.length) },
      { label: "Valor total", value: formatCurrency(totalAmount) },
      { label: "Recebido", value: formatCurrency(receivedAmount) },
      { label: "Pendente", value: formatCurrency(pendingAmount) },
      { label: "Vencido (inadimplência)", value: formatCurrency(overdueAmount) },
    ],
    tableHeadHtml,
    tableBodyHtml,
    rowCount: invoices.length,
    rowCap,
  });
}

module.exports = { render };
