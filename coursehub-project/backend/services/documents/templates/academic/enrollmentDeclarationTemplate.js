/**
 * Declaração de matrícula -- confirma que o aluno está/esteve
 * matriculado no curso. Mesmo idioma visual dos documentos
 * financeiros da Fase 1 (letterhead simples, fontes de sistema).
 */
const { escapeHtml, formatDate } = require("../../templateHelpers");
const { INSTITUTION } = require("../../../financial/contractTermsTemplate");
const { buildLogoSvg } = require("./logoAsset");

const VERSION = "1.0.0";

const ENROLLMENT_STATUS_LABEL = {
  active: "ativa",
  inactive: "inativa",
  completed: "concluída",
  cancelled: "cancelada",
  locked: "bloqueada",
};

/**
 * data: {
 *   student: { name, document },
 *   course: { name, workloadHours },
 *   enrollment: { status, enrolledAt },
 *   verificationUrl, verificationQrDataUri, verificationCode,
 *   issuedAt,
 * }
 */
function render(data) {
  const { student, course, enrollment, verificationQrDataUri, verificationCode } = data;
  const statusLabel = ENROLLMENT_STATUS_LABEL[enrollment.status] || enrollment.status;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Declaração de matrícula</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a2233; margin: 0; padding: 22mm 20mm; font-size: 13px; line-height: 1.7; }
  header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #0a2a57; padding-bottom: 14px; margin-bottom: 26px; }
  h1 { font-size: 16px; color: #0a2a57; margin: 0 0 4px; text-align: right; }
  .meta { font-size: 10.5px; color: #55627a; margin: 0; text-align: right; }
  p.body-text { text-align: justify; }
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
      <h1>Declaração de Matrícula</h1>
      <p class="meta">Emitida em ${formatDate(data.issuedAt)} · Modelo v${escapeHtml(VERSION)}</p>
    </div>
  </header>

  <p class="body-text">
    Declaramos, para os devidos fins, que <strong>${escapeHtml(student.name)}</strong>, portador(a) do documento nº ${escapeHtml(String(student.document || "não informado"))},
    encontra-se com matrícula <strong>${escapeHtml(statusLabel)}</strong> no curso <strong>"${escapeHtml(course.name)}"</strong>${
    course.workloadHours ? `, com carga horária total de ${escapeHtml(String(course.workloadHours))} horas` : ""
  }, oferecido pela ${escapeHtml(INSTITUTION.tradeName)}, desde ${formatDate(enrollment.enrolledAt)}.
  </p>

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
