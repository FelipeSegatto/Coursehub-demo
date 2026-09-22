/**
 * Declaração de frequência por período -- só emitida quando a
 * matrícula tem turma (frequência não existe sem sessões).
 */
const { escapeHtml, formatDate } = require("../../templateHelpers");
const { INSTITUTION } = require("../../../financial/contractTermsTemplate");
const { buildLogoSvg } = require("./logoAsset");

const VERSION = "1.0.0";

/**
 * data: {
 *   student: { name, document },
 *   course: { name },
 *   period: { start, end },
 *   attendance: { totalSessions, presentSessions, rate },
 *   verificationUrl, verificationQrDataUri, verificationCode,
 *   issuedAt,
 * }
 */
function render(data) {
  const { student, course, period, attendance, verificationQrDataUri, verificationCode } = data;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Declaração de frequência</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a2233; margin: 0; padding: 22mm 20mm; font-size: 13px; line-height: 1.7; }
  header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #0a2a57; padding-bottom: 14px; margin-bottom: 26px; }
  h1 { font-size: 16px; color: #0a2a57; margin: 0 0 4px; text-align: right; }
  .meta { font-size: 10.5px; color: #55627a; margin: 0; text-align: right; }
  p.body-text { text-align: justify; }
  table.info { width: 100%; border-collapse: collapse; margin: 20px 0; }
  table.info td { padding: 4px 0; }
  table.info td.label { width: 40%; color: #55627a; }
  .footer { margin-top: 40px; display: flex; align-items: flex-end; justify-content: space-between; }
  .qr img { width: 26mm; height: 26mm; }
  .verify { font-size: 9.5px; color: #55627a; text-align: center; margin-top: 4px; }
  .code { font-weight: 700; color: #0a2a57; }
</style>
</head>
<body>
  <header>
    ${buildLogoSvg({ width: 130 })}
    <div>
      <h1>Declaração de Frequência</h1>
      <p class="meta">Emitida em ${formatDate(data.issuedAt)} · Modelo v${escapeHtml(VERSION)}</p>
    </div>
  </header>

  <p class="body-text">
    Declaramos, para os devidos fins, que <strong>${escapeHtml(student.name)}</strong>, portador(a) do documento nº ${escapeHtml(String(student.document || "não informado"))},
    matriculado(a) no curso <strong>"${escapeHtml(course.name)}"</strong> na ${escapeHtml(INSTITUTION.tradeName)}, apresentou a seguinte frequência no período de ${formatDate(period.start)} a ${formatDate(period.end)}:
  </p>

  <table class="info">
    <tr><td class="label">Sessões no período</td><td>${escapeHtml(String(attendance.totalSessions))}</td></tr>
    <tr><td class="label">Presenças registradas</td><td>${escapeHtml(String(attendance.presentSessions))}</td></tr>
    <tr><td class="label">Percentual de frequência</td><td>${attendance.rate !== null ? `${escapeHtml(String(attendance.rate))}%` : "Sem sessões registradas no período"}</td></tr>
  </table>

  <p class="body-text">
    Por ser verdade, firmamos a presente declaração.
  </p>

  <div class="footer">
    <div class="qr">
      <img src="${verificationQrDataUri}" alt="QR code de verificação" />
      <p class="verify">Verifique a autenticidade<br />Código: <span class="code">${escapeHtml(verificationCode)}</span></p>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { version: VERSION, render };
