/**
 * Documento comercial do contrato (PDF, via a infraestrutura
 * compartilhada de geração) -- distinto de contract_terms_documents
 * (o termo de aceite/HTML aberto cru no navegador, gerado por
 * contractTermsDocumentService.js). Este é o documento formal, em
 * layout de carta timbrada, entregável ao contratante.
 *
 * "MINUTA" enquanto o contrato ainda não foi ativado (activatedAt
 * nulo); documento definitivo a partir da ativação -- nunca
 * regenerado depois disso mesmo que o plano/preço mude (ver
 * financialContractDocumentService.js#resolveIdempotencyKey).
 *
 * 100% autocontido: sem <link>/<img src="http://...">/@import de CDN
 * -- o renderer bloqueia qualquer requisição de rede (ver
 * documentRendererService.js), então qualquer referência externa aqui
 * simplesmente falharia silenciosamente.
 */
const {
  escapeHtml,
  formatCurrency,
  formatDate,
  formatDocument,
  formatAddress,
} = require("../../templateHelpers");
const { INSTITUTION } = require("../../../financial/contractTermsTemplate");

const VERSION = "1.0.0";

const BILLING_TYPE_TEXT = {
  one_time: "Pagamento único",
  monthly_plan: "Plano com mensalidades",
};

function buildPlanText({ billingType, totalAmount, monthlyPaymentCount, monthlyPaymentAmount }) {
  if (billingType === "monthly_plan" && monthlyPaymentCount) {
    return `${formatCurrency(totalAmount)}, parcelado em ${monthlyPaymentCount}x de ${formatCurrency(monthlyPaymentAmount)}`;
  }

  return `${formatCurrency(totalAmount)}, em pagamento único`;
}

/**
 * data: {
 *   contract: { id, planName, billingType, totalAmount, monthlyPaymentCount,
 *               monthlyPaymentAmount, startDate, createdAt, activatedAt, stage },
 *   course: { name },
 *   contractingParty: { name, document, email, phone, address },
 *   student: { name, document },
 *   firstInvoice: { amount, dueDate, description },
 * }
 */
function render(data) {
  const { contract, course, contractingParty, student, firstInvoice } = data;
  const isDraft = contract.stage === "draft";
  const planText = buildPlanText(contract);
  const billingTypeText = BILLING_TYPE_TEXT[contract.billingType] || contract.billingType;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${isDraft ? "Minuta de contrato" : "Contrato"} nº ${escapeHtml(String(contract.id))}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    color: #1a2233;
    margin: 0;
    padding: 20mm 18mm;
    font-size: 12.5px;
    line-height: 1.6;
  }
  header { text-align: center; border-bottom: 2px solid #0a2a57; padding-bottom: 12px; margin-bottom: 20px; }
  .brand { font-size: 20px; font-weight: 700; color: #0a2a57; letter-spacing: -0.02em; margin: 0; }
  .brand .hub { color: #f46c3c; }
  h1 { font-size: 16px; margin: 10px 0 4px; color: #0a2a57; }
  .meta { font-size: 10.5px; color: #55627a; margin: 0; }
  .badge {
    display: inline-block; margin-top: 10px; padding: 4px 14px; border-radius: 999px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
  }
  .badge.draft { background: #fef3c7; color: #92400e; }
  .badge.definitive { background: #dcfce7; color: #166534; }
  section { margin-bottom: 16px; }
  h2 { font-size: 12.5px; color: #0a2a57; margin: 18px 0 6px; }
  table.info { width: 100%; border-collapse: collapse; }
  table.info td { padding: 4px 0; vertical-align: top; }
  table.info td.label { width: 34%; color: #55627a; }
  .signatures { margin-top: 36px; width: 100%; border-collapse: collapse; }
  .signatures td { width: 50%; padding-top: 28px; border-top: 1px solid #99a3b3; font-size: 11px; }
  footer { margin-top: 30px; font-size: 9.5px; color: #8a93a6; text-align: center; }
</style>
</head>
<body>
  <header>
    <p class="brand">Course<span class="hub">Hub</span></p>
    <h1>${isDraft ? "Minuta de Contrato" : "Contrato"} de Prestação de Serviços Educacionais</h1>
    <p class="meta">Contrato nº ${escapeHtml(String(contract.id))} · Modelo v${escapeHtml(VERSION)} · Emitido em ${formatDate(new Date())}</p>
    <span class="badge ${isDraft ? "draft" : "definitive"}">${isDraft ? "Minuta — sem validade" : "Documento definitivo"}</span>
  </header>

  <section>
    <h2>Partes</h2>
    <table class="info">
      <tr><td class="label">Contratada</td><td>${escapeHtml(INSTITUTION.legalName)} (${escapeHtml(INSTITUTION.tradeName)}), CNPJ ${escapeHtml(INSTITUTION.cnpj)}</td></tr>
      <tr><td class="label">Contratante</td><td>${escapeHtml(contractingParty.name)} — ${escapeHtml(formatDocument(contractingParty.document))}</td></tr>
      <tr><td class="label">E-mail do contratante</td><td>${escapeHtml(contractingParty.email)}</td></tr>
      <tr><td class="label">Endereço do contratante</td><td>${escapeHtml(formatAddress(contractingParty.address))}</td></tr>
      <tr><td class="label">Aluno(a) beneficiário(a)</td><td>${escapeHtml(student.name)} — ${escapeHtml(formatDocument(student.document))}</td></tr>
    </table>
  </section>

  <section>
    <h2>Curso e plano contratado</h2>
    <table class="info">
      <tr><td class="label">Curso</td><td>${escapeHtml(course.name)}</td></tr>
      <tr><td class="label">Plano</td><td>${escapeHtml(contract.planName)}</td></tr>
      <tr><td class="label">Modalidade de cobrança</td><td>${escapeHtml(billingTypeText)}</td></tr>
      <tr><td class="label">Valor total</td><td>${planText}</td></tr>
      <tr><td class="label">Data de início</td><td>${formatDate(contract.startDate)}</td></tr>
      <tr><td class="label">Primeira cobrança</td><td>${formatCurrency(firstInvoice.amount)}, vencimento em ${formatDate(firstInvoice.dueDate)}</td></tr>
    </table>
  </section>

  ${
    isDraft
      ? `<p style="color:#92400e; font-weight:600;">Este documento é uma minuta e não tem validade contratual. O contrato passa a ser definitivo automaticamente na ativação, condicionada à confirmação do pagamento da primeira cobrança.</p>`
      : `<table class="info"><tr><td class="label">Ativado em</td><td>${formatDate(contract.activatedAt)}</td></tr></table>`
  }

  <table class="signatures">
    <tr>
      <td>${escapeHtml(INSTITUTION.tradeName)}<br />CONTRATADA</td>
      <td style="text-align:right;">${escapeHtml(contractingParty.name)}<br />CONTRATANTE</td>
    </tr>
  </table>

  <footer>Documento gerado eletronicamente pela plataforma CourseHub · Contrato nº ${escapeHtml(String(contract.id))} · Modelo v${escapeHtml(VERSION)}</footer>
</body>
</html>`;
}

module.exports = { version: VERSION, render };
