/**
 * Certificado de conclusão -- adaptado do template certificate-preview.html
 * já revisado e aprovado pelo usuário. Três ajustes em relação ao
 * original para funcionar dentro do renderer (que bloqueia toda
 * requisição de rede):
 *   1. As 3 fontes (Great Vibes, Inter, UnifrakturCook), antes
 *      carregadas via @import de CDN, agora vêm embutidas como
 *      base64 (fontAssets.js) -- baixadas uma única vez em tempo de
 *      implementação, nunca buscadas em tempo de renderização.
 *   2. O logo placeholder genérico virou o SVG real do CourseHub
 *      (logoAsset.js, mesmo markup de coursehub/src/components/logo/Logo.jsx).
 *   3. O QR code placeholder (um padrão de blocos arbitrário) virou
 *      um QR code real, gerado em certificateService.js#buildCertificateSnapshot
 *      e já embutido como data URI no snapshot -- o template nunca
 *      gera nada, só embute o que já veio pronto.
 *
 * SIGNATORY vem de institutionConfig (env + fachada de demonstração).
 * Não existe cadastro de diretor acadêmico no sistema; o nome é
 * configurável por INSTITUTION_SIGNATORY_NAME / _ROLE.
 */
const { escapeHtml, formatDate } = require("../../templateHelpers");
const { INSTITUTION } = require("../../../financial/contractTermsTemplate");
const { getSignatory } = require("../../../../config/institutionConfig");
const { FONT_FACES_CSS } = require("./fontAssets");
const { buildLogoSvg } = require("./logoAsset");

const VERSION = "1.0.0";

const SIGNATORY = getSignatory();

/**
 * data: {
 *   student: { name },
 *   course: { name, workloadHours },
 *   completedAt,
 *   verificationUrl, verificationQrDataUri, verificationCode,
 * }
 */
function render(data) {
  const { student, course, completedAt, verificationUrl, verificationQrDataUri, verificationCode } = data;

  // O QR code já carrega a URL completa (com o código no path); o
  // texto abaixo dele só precisa de um rótulo curto, não da URL
  // inteira -- que em produção fica bem mais longa que a página tem
  // espaço para exibir sem quebrar/vazar.
  let verificationHost;
  try {
    const parsed = new URL(verificationUrl);
    verificationHost = `${parsed.host}/documentos/verificar`;
  } catch {
    verificationHost = "documentos/verificar";
  }

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Certificado CourseHub</title>
  <style>
    ${FONT_FACES_CSS}

    :root {
      --navy: #0a2a57;
      --navy-2: #0f3a72;
      --orange: #f46c3c;
      --gold: #d7aa45;
      --gold-light: #f4d272;
      --paper: #fbfaf5;
      --ink: #0f2850;
      --muted: #516074;
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      min-height: 100%;
      background: #e9e7df;
      font-family: 'Inter', Arial, sans-serif;
      color: var(--ink);
    }

    body {
      display: grid;
      place-items: center;
      padding: 0;
    }

    .certificate {
      position: relative;
      width: 297mm;
      height: 210mm;
      overflow: hidden;
      background:
        repeating-radial-gradient(ellipse at 50% 50%, rgba(10,42,87,.035) 0 1px, transparent 1px 8px),
        linear-gradient(180deg, #fffefa 0%, var(--paper) 100%);
      border: 7mm solid var(--navy);
    }

    .certificate::before {
      content: '';
      position: absolute;
      inset: 3.6mm;
      border: 0.7mm solid rgba(10,42,87,.85);
      pointer-events: none;
    }

    .certificate::after {
      content: '';
      position: absolute;
      inset: 7.3mm;
      border: 0.27mm solid rgba(10,42,87,.55);
      pointer-events: none;
    }

    .corner {
      position: absolute;
      width: 12mm;
      height: 12mm;
      z-index: 5;
    }
    .corner::before,
    .corner::after {
      content: '';
      position: absolute;
      background: linear-gradient(135deg, var(--gold-light), var(--gold));
    }
    .corner::before { width: 12mm; height: 3.7mm; }
    .corner::after { width: 3.7mm; height: 12mm; }
    .tl { left: -1px; top: -1px; }
    .tr { right: -1px; top: -1px; transform: rotate(90deg); }
    .br { right: -1px; bottom: -1px; transform: rotate(180deg); }
    .bl { left: -1px; bottom: -1px; transform: rotate(270deg); }

    .inner {
      position: absolute;
      inset: 9.5mm 10mm 8.5mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      z-index: 2;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 3mm;
      margin-top: 6mm;
      margin-bottom: 2.5mm;
    }

    .title {
      margin: 0;
      font-family: 'UnifrakturCook', 'Old English Text MT', 'Times New Roman', serif;
      font-size: 28mm;
      line-height: .95;
      color: var(--navy);
      letter-spacing: .2mm;
      font-weight: 700;
    }
    .title .initial { color: var(--orange); }

    .eyebrow {
      margin-top: 2mm;
      font-size: 5.5mm;
      letter-spacing: 1.1mm;
      font-weight: 500;
    }

    .student-name {
      margin-top: 1.2mm;
      width: 55%;
      padding-bottom: 1.7mm;
      border-bottom: .55mm solid var(--navy);
      font-family: 'Great Vibes', 'Brush Script MT', cursive;
      font-size: 17mm;
      line-height: 1.12;
      color: var(--navy);
    }

    .course-copy {
      margin-top: 4.6mm;
      font-size: 5.3mm;
      line-height: 1.55;
      max-width: 155mm;
      color: #132a4f;
    }
    .course-copy strong { color: var(--orange); font-size: 6.7mm; }

    .description {
      margin-top: 2mm;
      max-width: 150mm;
      font-size: 4mm;
      line-height: 1.45;
      color: #213654;
    }

    .footer-row {
      margin-top: auto;
      width: 100%;
      display: grid;
      grid-template-columns: 1fr 32mm 1fr 42mm;
      align-items: end;
      gap: 8mm;
      padding: 0 14mm 5mm;
    }

    .field .value {
      font-size: 4.7mm;
      font-weight: 700;
      font-style: italic;
      padding-bottom: 2.4mm;
      border-bottom: .45mm solid var(--navy);
      white-space: nowrap;
    }
    .field .label {
      margin-top: 2.3mm;
      font-size: 3.1mm;
      letter-spacing: .15mm;
      font-weight: 500;
    }

    .signature .value {
      font-family: 'Great Vibes', 'Brush Script MT', cursive;
      font-size: 10mm;
      font-style: normal;
      font-weight: 400;
      line-height: 1;
      padding-bottom: 1.4mm;
      /* Diferente do campo de data (sempre curto), o nome do
         signatário pode ser longo (inclusive o placeholder
         "[PREENCHER]") -- quebra em vez de vazar para fora da
         página, como o restante dos campos de .field faz. */
      white-space: normal;
      overflow-wrap: break-word;
    }

    .seal {
      width: 31mm;
      height: 31mm;
      border-radius: 50%;
      display: grid;
      place-items: center;
      position: relative;
      background:
        radial-gradient(circle at 35% 25%, #f8dc7f 0 11%, transparent 12%),
        radial-gradient(circle, #e6bd58 0 44%, #c49229 45% 52%, #f0cf69 53% 63%, #c58f22 64% 100%);
      border: 1.6mm solid #e9c65e;
    }
    .seal::before {
      content: '';
      position: absolute;
      inset: 2mm;
      border: .45mm solid rgba(10,42,87,.55);
      border-radius: 50%;
    }
    .seal svg { width: 13mm; height: 13mm; position: relative; z-index: 2; }

    .verify {
      text-align: center;
      color: var(--navy);
      font-size: 2.8mm;
      line-height: 1.35;
      overflow-wrap: break-word;
    }
    .verify .host {
      font-size: 2.6mm;
      color: var(--muted);
    }
    .qr {
      width: 19mm;
      height: 19mm;
      margin: 0 auto 2mm;
      border: .35mm solid var(--navy);
      background: white;
      padding: 1.2mm;
    }
    .qr img { width: 100%; height: 100%; display: block; }
    .verify strong { display: block; margin-bottom: .5mm; }
    .code { margin-top: 1.4mm; font-weight: 700; }

    .ornament {
      position: absolute;
      color: var(--navy);
      opacity: .92;
      z-index: 3;
    }
    .ornament.top,
    .ornament.bottom {
      left: 50%;
      transform: translateX(-50%);
      width: 55mm;
      height: 10mm;
    }
    .ornament.top { top: 5mm; }
    .ornament.bottom { bottom: 4mm; transform: translateX(-50%) rotate(180deg); }
    .ornament.left,
    .ornament.right {
      top: 50%;
      width: 9mm;
      height: 52mm;
    }
    .ornament.left { left: 4.5mm; transform: translateY(-50%) rotate(-90deg); }
    .ornament.right { right: 4.5mm; transform: translateY(-50%) rotate(90deg); }

    .corner-motif {
      position: absolute;
      width: 13mm;
      height: 13mm;
      color: var(--navy);
      opacity: .95;
      z-index: 3;
    }
    .motif-tl { top: 12mm; left: 13mm; }
    .motif-tr { top: 12mm; right: 13mm; transform: rotate(90deg); }
    .motif-bl { bottom: 12mm; left: 13mm; transform: rotate(-90deg); }

    @page {
      size: A4 landscape;
      margin: 0;
    }
  </style>
</head>
<body>
  <main class="certificate">
    <span class="corner tl"></span><span class="corner tr"></span><span class="corner br"></span><span class="corner bl"></span>

    <svg class="ornament top" viewBox="0 0 220 40" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M0 20h52c14 0 18-12 7-17-9-4-22 4-14 13 9 10 31 1 33-9 3 14 23 14 31 2 0 11 17 15 24 6 8 10 28 9 31-4 4 11 21 15 29 8 5-5 0-12-8-12-8 0-18 7-17 14 1 7 9 9 17 9H220"/>
    </svg>
    <svg class="ornament bottom" viewBox="0 0 220 40" fill="none" stroke="currentColor" stroke-width="2"><path d="M0 20h52c14 0 18-12 7-17-9-4-22 4-14 13 9 10 31 1 33-9 3 14 23 14 31 2 0 11 17 15 24 6 8 10 28 9 31-4 4 11 21 15 29 8 5-5 0-12-8-12-8 0-18 7-17 14 1 7 9 9 17 9H220"/></svg>
    <svg class="ornament left" viewBox="0 0 220 40" fill="none" stroke="currentColor" stroke-width="2"><path d="M0 20h52c14 0 18-12 7-17-9-4-22 4-14 13 9 10 31 1 33-9 3 14 23 14 31 2 0 11 17 15 24 6 8 10 28 9 31-4 4 11 21 15 29 8 5-5 0-12-8-12-8 0-18 7-17 14 1 7 9 9 17 9H220"/></svg>
    <svg class="ornament right" viewBox="0 0 220 40" fill="none" stroke="currentColor" stroke-width="2"><path d="M0 20h52c14 0 18-12 7-17-9-4-22 4-14 13 9 10 31 1 33-9 3 14 23 14 31 2 0 11 17 15 24 6 8 10 28 9 31-4 4 11 21 15 29 8 5-5 0-12-8-12-8 0-18 7-17 14 1 7 9 9 17 9H220"/></svg>

    <svg class="corner-motif motif-tl" viewBox="0 0 60 60" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M7 30c7-6 7-13 1-18 7 0 12-2 16-8 3 8 10 11 17 8-5 5-4 12 3 17-8-1-13 2-15 9-3-7-10-10-17-7 2-5 0-9-5-11Z"/>
      <circle cx="30" cy="30" r="6"/><path d="M15 45c10-5 20-5 30 0M16 17c10 6 19 6 28 0"/>
    </svg>
    <svg class="corner-motif motif-tr" viewBox="0 0 60 60" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 30c7-6 7-13 1-18 7 0 12-2 16-8 3 8 10 11 17 8-5 5-4 12 3 17-8-1-13 2-15 9-3-7-10-10-17-7 2-5 0-9-5-11Z"/><circle cx="30" cy="30" r="6"/><path d="M15 45c10-5 20-5 30 0M16 17c10 6 19 6 28 0"/></svg>
    <svg class="corner-motif motif-bl" viewBox="0 0 60 60" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 30c7-6 7-13 1-18 7 0 12-2 16-8 3 8 10 11 17 8-5 5-4 12 3 17-8-1-13 2-15 9-3-7-10-10-17-7 2-5 0-9-5-11Z"/><circle cx="30" cy="30" r="6"/><path d="M15 45c10-5 20-5 30 0M16 17c10 6 19 6 28 0"/></svg>

    <section class="inner">
      <div class="logo">${buildLogoSvg({ width: "50mm" })}</div>

      <h1 class="title"><span class="initial">C</span>ertificado</h1>
      <div class="eyebrow">CERTIFICAMOS QUE</div>
      <div class="student-name">${escapeHtml(student.name)}</div>

      <div class="course-copy">
        concluiu com aproveitamento, em ${formatDate(completedAt)}, o curso<br>
        <strong>${escapeHtml(course.name)}</strong><br>
        ${course.workloadHours ? `com carga horária de <strong>${escapeHtml(String(course.workloadHours))} horas.</strong>` : ""}
      </div>

      <div class="description">
        Este curso foi oferecido pela ${escapeHtml(INSTITUTION.tradeName)}, plataforma de gestão educacional<br>
        para ensino, aprendizagem e desenvolvimento.
      </div>

      <div class="footer-row">
        <div class="field">
          <div class="value">${formatDate(completedAt)}</div>
          <div class="label">DATA DE CONCLUSÃO</div>
        </div>

        <div class="seal" aria-label="Selo CourseHub">
          <svg viewBox="0 0 64 64">
            <polygon points="32,7 55,19 32,31 9,19" fill="none" stroke="#0a2a57" stroke-width="6"/>
            <path d="M15 31l17 9 17-9M15 41l17 9 17-9" fill="none" stroke="#0a2a57" stroke-width="6"/>
          </svg>
        </div>

        <div class="field signature">
          <div class="value">${escapeHtml(SIGNATORY.name)}</div>
          <div class="label">${escapeHtml(SIGNATORY.role.toUpperCase())}</div>
        </div>

        <div class="verify">
          <div class="qr" aria-label="QR Code de verificação">
            <img src="${verificationQrDataUri}" alt="QR code de verificação" />
          </div>
          <strong>VERIFIQUE A AUTENTICIDADE</strong>
          <div class="host">${escapeHtml(verificationHost)}</div>
          <div class="code">CÓDIGO: ${escapeHtml(verificationCode)}</div>
        </div>
      </div>
    </section>
  </main>
</body>
</html>`;
}

module.exports = { version: VERSION, render };
