/**
 * QR code real, gerado no momento em que o snapshot do documento é
 * montado (nunca no renderer -- o resultado já é um data URI PNG
 * embutido no HTML, sem nenhuma requisição de rede em tempo de
 * renderização). Aponta para a rota pública de verificação com o
 * código do documento, mesma convenção de FRONTEND_URL já usada por
 * invoicePaymentAccessService.js.
 */
const QRCode = require("qrcode");

function getFrontendUrl() {
  return process.env.FRONTEND_URL || "http://localhost:5173";
}

function buildVerificationUrl(verificationCode) {
  return `${getFrontendUrl()}/documentos/verificar/${verificationCode}`;
}

async function buildVerificationQrDataUri(verificationCode) {
  const url = buildVerificationUrl(verificationCode);

  return QRCode.toDataURL(url, { width: 260, margin: 1, errorCorrectionLevel: "M" });
}

module.exports = { buildVerificationUrl, buildVerificationQrDataUri };
