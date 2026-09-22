/**
 * Casca HTML/CSS compartilhada pelos templates de relatório
 * (backend/services/reports/templates/*.js). Diferente dos templates
 * de documento formal (services/documents/templates/*.js), aqui não
 * há número de verificação nem selo de autenticidade -- é uma
 * exportação de consulta, então o cabeçalho/rodapé só precisam
 * registrar quem pediu, quando, e com quais filtros, para que o PDF
 * seja auditável como "o que essa pessoa viu nessa tela, nesse
 * momento" sem virar um documento oficial imutável.
 */
const { escapeHtml, formatDateTime } = require("../documents/templateHelpers");

/**
 * @param {object} params
 * @param {string} params.title - ex: "Relatório financeiro -- faturas"
 * @param {string[]} params.filterLines - descrições já formatadas dos filtros aplicados, ex: ["Status: Vencida", "Período: 01/01/2026 a 31/01/2026"]
 * @param {string} params.requestedByName
 * @param {Date} params.generatedAt
 * @param {{label:string, value:string}[]} [params.summaryCards] - totais calculados pelo backend
 * @param {string} params.tableHeadHtml - conteúdo de <thead><tr>...
 * @param {string} params.tableBodyHtml - conteúdo de <tbody>...
 * @param {number} params.rowCount
 * @param {number} params.rowCap
 */
function renderReportDocument({
  title,
  filterLines = [],
  requestedByName,
  generatedAt,
  summaryCards = [],
  tableHeadHtml,
  tableBodyHtml,
  rowCount,
  rowCap,
}) {
  const filtersDescription = filterLines.length > 0 ? filterLines.map(escapeHtml).join(" · ") : "Nenhum filtro aplicado";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  @page { size: A4 landscape; margin: 14mm 12mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a2233; margin: 0; font-size: 10px; line-height: 1.4; }
  header { border-bottom: 2px solid #0a2a57; padding-bottom: 10px; margin-bottom: 14px; }
  .brand { font-size: 15px; font-weight: 700; color: #0a2a57; margin: 0; }
  .brand .hub { color: #f46c3c; }
  h1 { font-size: 13px; margin: 6px 0 4px; color: #0a2a57; }
  .filters { font-size: 9px; color: #55627a; margin: 0; }
  .summary { display: flex; gap: 10px; margin-bottom: 14px; }
  .summary .card { flex: 1; border: 1px solid #d7dce5; border-radius: 6px; padding: 8px 10px; background: #f8fafc; }
  .summary .card .label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.04em; color: #55627a; margin: 0 0 3px; }
  .summary .card .value { font-size: 13px; font-weight: 700; color: #0a2a57; margin: 0; font-variant-numeric: tabular-nums; }
  table.report { width: 100%; border-collapse: collapse; }
  table.report thead { display: table-header-group; }
  table.report tr { break-inside: avoid; page-break-inside: avoid; }
  table.report th { text-align: left; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.03em; color: #55627a; border-bottom: 1.5px solid #0a2a57; padding: 5px 6px; background: #fff; }
  table.report td { padding: 5px 6px; border-bottom: 1px solid #e5e9f0; font-variant-numeric: tabular-nums; }
  table.report tbody tr:nth-child(even) { background: #f8fafc; }
  .empty { padding: 20px 0; text-align: center; color: #8a93a6; font-size: 10px; }
  footer { margin-top: 12px; font-size: 8px; color: #8a93a6; }
</style>
</head>
<body>
  <header>
    <p class="brand">Course<span class="hub">Hub</span></p>
    <h1>${escapeHtml(title)}</h1>
    <p class="filters">Filtros aplicados: ${filtersDescription}</p>
  </header>

  ${summaryCards.length > 0
    ? `<section class="summary">${summaryCards
        .map((card) => `<div class="card"><p class="label">${escapeHtml(card.label)}</p><p class="value">${escapeHtml(card.value)}</p></div>`)
        .join("")}</section>`
    : ""}

  ${rowCount > 0
    ? `<table class="report">
    <thead><tr>${tableHeadHtml}</tr></thead>
    <tbody>${tableBodyHtml}</tbody>
  </table>`
    : `<p class="empty">Nenhum registro encontrado para os filtros aplicados.</p>`}

  <footer>Relatório gerado eletronicamente pela plataforma CourseHub · Solicitado por ${escapeHtml(requestedByName)} em ${formatDateTime(generatedAt)} · ${rowCount} registro(s)${rowCount >= rowCap ? ` (limite de ${rowCap} atingido -- refine os filtros para ver o restante)` : ""}</footer>
</body>
</html>`;
}

module.exports = { renderReportDocument };
