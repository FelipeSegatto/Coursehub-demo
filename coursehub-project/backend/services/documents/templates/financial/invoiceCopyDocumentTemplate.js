/**
 * 2ª via de fatura -- representa a invoice existente com seu status
 * atual (aberta/vencida/paga/cancelada/reembolsada). Nunca é um
 * recibo: mesmo quando a fatura está paga, este documento continua
 * rotulado "2ª via", o recibo é um documento separado
 * (paymentReceiptDocumentTemplate.js) emitido a partir do pagamento
 * confirmado, não da fatura.
 */
const { escapeHtml, formatCurrency, formatDate } = require("../../templateHelpers");
const { INSTITUTION } = require("../../../financial/contractTermsTemplate");

const VERSION = "1.0.0";

const STATUS_LABEL = {
  pending: "Em aberto",
  processing: "Pagamento em processamento",
  paid: "Paga",
  overdue: "Vencida",
  cancelled: "Cancelada",
  refunded: "Reembolsada",
};

const STATUS_CLASS = {
  pending: "info",
  processing: "info",
  paid: "ok",
  overdue: "warn",
  cancelled: "muted",
  refunded: "muted",
};

/**
 * data: {
 *   invoice: { id, description, originalAmount, amount, discountAmount, dueDate, status, paidAt },
 *   contract: { id, planName },
 *   course: { name },
 *   contractingParty: { name, email },
 *   student: { name },
 * }
 */
function render(data) {
  const { invoice, contract, course, contractingParty, student } = data;
  const statusLabel = STATUS_LABEL[invoice.status] || invoice.status;
  const statusClass = STATUS_CLASS[invoice.status] || "info";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>2ª via de fatura nº ${escapeHtml(String(invoice.id))}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a2233; margin: 0; padding: 20mm 18mm; font-size: 12.5px; line-height: 1.6; }
  header { text-align: center; border-bottom: 2px solid #0a2a57; padding-bottom: 12px; margin-bottom: 20px; }
  .brand { font-size: 20px; font-weight: 700; color: #0a2a57; margin: 0; }
  .brand .hub { color: #f46c3c; }
  h1 { font-size: 16px; margin: 10px 0 4px; color: #0a2a57; }
  .meta { font-size: 10.5px; color: #55627a; margin: 0; }
  .status { display: inline-block; margin-top: 10px; padding: 4px 14px; border-radius: 999px; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; }
  .status.ok { background: #dcfce7; color: #166534; }
  .status.warn { background: #fee2e2; color: #991b1b; }
  .status.info { background: #dbeafe; color: #1e40af; }
  .status.muted { background: #e5e7eb; color: #374151; }
  section { margin-bottom: 16px; }
  h2 { font-size: 12.5px; color: #0a2a57; margin: 18px 0 6px; }
  table.info { width: 100%; border-collapse: collapse; }
  table.info td { padding: 4px 0; vertical-align: top; }
  table.info td.label { width: 34%; color: #55627a; }
  .amount { font-size: 20px; font-weight: 700; color: #0a2a57; }
  footer { margin-top: 30px; font-size: 9.5px; color: #8a93a6; text-align: center; }
</style>
</head>
<body>
  <header>
    <p class="brand">Course<span class="hub">Hub</span></p>
    <h1>2ª via de fatura</h1>
    <p class="meta">Fatura nº ${escapeHtml(String(invoice.id))} · Modelo v${escapeHtml(VERSION)} · Emitida em ${formatDate(new Date())}</p>
    <span class="status ${statusClass}">${escapeHtml(statusLabel)}</span>
  </header>

  <section>
    <p class="amount">${formatCurrency(invoice.amount)}</p>
  </section>

  <section>
    <h2>Dados da cobrança</h2>
    <table class="info">
      <tr><td class="label">Descrição</td><td>${escapeHtml(invoice.description)}</td></tr>
      <tr><td class="label">Curso</td><td>${escapeHtml(course.name)}</td></tr>
      <tr><td class="label">Plano</td><td>${escapeHtml(contract.planName)}</td></tr>
      <tr><td class="label">Vencimento</td><td>${formatDate(invoice.dueDate)}</td></tr>
      ${invoice.status === "paid" ? `<tr><td class="label">Pago em</td><td>${formatDate(invoice.paidAt)}</td></tr>` : ""}
      ${Number(invoice.discountAmount) > 0 ? `<tr><td class="label">Desconto aplicado</td><td>${formatCurrency(invoice.discountAmount)}</td></tr>` : ""}
    </table>
  </section>

  <section>
    <h2>Partes</h2>
    <table class="info">
      <tr><td class="label">Instituição</td><td>${escapeHtml(INSTITUTION.legalName)}</td></tr>
      <tr><td class="label">Contratante</td><td>${escapeHtml(contractingParty.name)} (${escapeHtml(contractingParty.email)})</td></tr>
      <tr><td class="label">Aluno(a)</td><td>${escapeHtml(student.name)}</td></tr>
    </table>
  </section>

  <p style="font-size: 10.5px; color:#55627a;">Este documento é uma representação da fatura acima, no estado em que se encontrava no momento da emissão desta via. Não é um recibo de pagamento.</p>

  <footer>Documento gerado eletronicamente pela plataforma CourseHub · Fatura nº ${escapeHtml(String(invoice.id))} · Modelo v${escapeHtml(VERSION)}</footer>
</body>
</html>`;
}

module.exports = { version: VERSION, render };
