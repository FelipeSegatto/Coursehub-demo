/**
 * Recibo de pagamento -- só pode ser emitido para um pagamento já
 * 'approved' (ver paymentReceiptDocumentService.js, que rejeita com
 * 409 antes mesmo de chegar aqui). Nunca exibe dado bruto do gateway
 * (sem gateway_payment_id completo, sem payload) -- só uma referência
 * curta e segura.
 */
const { escapeHtml, formatCurrency, formatDateTime, formatDate } = require("../../templateHelpers");
const { INSTITUTION } = require("../../../financial/contractTermsTemplate");

const VERSION = "1.0.0";

const PAYMENT_METHOD_LABEL = {
  pix: "Pix",
  boleto: "Boleto bancário",
  credit_card: "Cartão de crédito",
  bank_transfer: "Transferência bancária",
  cash: "Dinheiro",
  other: "Outro",
};

/**
 * data: {
 *   payment: { id, amount, currency, paidAt, paymentMethod, safeReference },
 *   invoice: { id, description },
 *   contract: { id, planName },
 *   course: { name },
 *   payer: { name, document, email },
 * }
 */
function render(data) {
  const { payment, invoice, contract, course, payer } = data;
  const methodLabel = PAYMENT_METHOD_LABEL[payment.paymentMethod] || payment.paymentMethod;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Recibo de pagamento nº ${escapeHtml(String(payment.id))}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a2233; margin: 0; padding: 20mm 18mm; font-size: 12.5px; line-height: 1.6; }
  header { text-align: center; border-bottom: 2px solid #0a2a57; padding-bottom: 12px; margin-bottom: 20px; }
  .brand { font-size: 20px; font-weight: 700; color: #0a2a57; margin: 0; }
  .brand .hub { color: #f46c3c; }
  h1 { font-size: 16px; margin: 10px 0 4px; color: #0a2a57; }
  .meta { font-size: 10.5px; color: #55627a; margin: 0; }
  .status { display: inline-block; margin-top: 10px; padding: 4px 14px; border-radius: 999px; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; background: #dcfce7; color: #166534; }
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
    <h1>Recibo de Pagamento</h1>
    <p class="meta">Recibo referente ao pagamento nº ${escapeHtml(String(payment.id))} · Modelo v${escapeHtml(VERSION)} · Emitido em ${formatDate(new Date())}</p>
    <span class="status">Pagamento confirmado</span>
  </header>

  <section>
    <p class="amount">${formatCurrency(payment.amount)}</p>
  </section>

  <section>
    <h2>Dados do pagamento</h2>
    <table class="info">
      <tr><td class="label">Pago em</td><td>${formatDateTime(payment.paidAt)}</td></tr>
      <tr><td class="label">Forma de pagamento</td><td>${escapeHtml(methodLabel)}</td></tr>
      <tr><td class="label">Referência</td><td>${escapeHtml(payment.safeReference)}</td></tr>
      <tr><td class="label">Fatura referente</td><td>#${escapeHtml(String(invoice.id))} — ${escapeHtml(invoice.description)}</td></tr>
      <tr><td class="label">Curso</td><td>${escapeHtml(course.name)}</td></tr>
      <tr><td class="label">Plano</td><td>${escapeHtml(contract.planName)}</td></tr>
    </table>
  </section>

  <section>
    <h2>Partes</h2>
    <table class="info">
      <tr><td class="label">Recebedor</td><td>${escapeHtml(INSTITUTION.legalName)}, CNPJ ${escapeHtml(INSTITUTION.cnpj)}</td></tr>
      <tr><td class="label">Pagador</td><td>${escapeHtml(payer.name)} — ${escapeHtml(payer.email)}</td></tr>
    </table>
  </section>

  <footer>Documento gerado eletronicamente pela plataforma CourseHub · Pagamento nº ${escapeHtml(String(payment.id))} · Modelo v${escapeHtml(VERSION)}</footer>
</body>
</html>`;
}

module.exports = { version: VERSION, render };
