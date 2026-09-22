/**
 * PDF de progresso individual por matrícula -- relatório operacional
 * (não documento formal: sem versionamento, sem verificação, sem
 * generated_documents). Estrutura própria (multi-seção, não uma
 * tabela grande) por isso não reaproveita renderReportDocument
 * (../reportTemplateHelpers.js), pensado para relatórios tabulares em
 * paisagem -- aqui é retrato, mais perto dos templates de documento
 * formal (services/documents/templates/*.js) na forma, mas sem
 * nenhuma das garantias de imutabilidade deles.
 */
const { escapeHtml, formatDate, formatDateTime } = require("../../documents/templateHelpers");
const { INSTITUTION } = require("../../financial/contractTermsTemplate");

const ENROLLMENT_STATUS_LABEL = {
  active: "Ativa",
  inactive: "Inativa",
  completed: "Concluída",
  cancelled: "Cancelada",
  locked: "Bloqueada",
};

const CONTENT_TYPE_LABEL = {
  video: "Vídeo",
  pdf: "PDF",
  text: "Texto",
  live_class: "Aula ao vivo",
};

const CONTENT_STATUS_LABEL = {
  completed: "Concluído",
  in_progress: "Em andamento",
  not_started: "Não iniciado",
};

const ACADEMIC_STATUS_LABEL = {
  pending: "Pendente",
  overdue: "Atrasada",
  submitted: "Entregue",
  graded: "Corrigida",
  returned: "Devolvida",
};

function formatPercentage(value) {
  return value === null || value === undefined ? "—" : `${Number(value).toFixed(1)}%`;
}

const CONTENT_CHART_COLORS = ["#22c55e", "#3b82f6", "#d1d5db"];
const ACADEMIC_CHART_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444"];

/**
 * Rosca de progresso em SVG puro, gerado no servidor -- mesmos
 * números/cores do gráfico que a diretora vê na tela
 * (components/charts/ProgressDonutChart.jsx no frontend), nunca um
 * screenshot da página React. Sem biblioteca de gráfico: só
 * trigonometria simples pra desenhar cada fatia como um arco SVG.
 */
function polarToCartesian(cx, cy, r, angleDeg) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;

  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const clampedEnd = Math.min(endAngle, startAngle + 359.99);
  const start = polarToCartesian(cx, cy, r, clampedEnd);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = clampedEnd - startAngle <= 180 ? "0" : "1";

  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function buildDonutSvg({ segments, centerValue, centerLabel, size = 130, strokeWidth = 20 }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - strokeWidth / 2;
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  const arcsHtml =
    total > 0
      ? (() => {
          let cursor = 0;

          return segments
            .filter((segment) => segment.value > 0)
            .map((segment) => {
              const angle = (segment.value / total) * 360;
              const d = describeArc(cx, cy, r, cursor, cursor + angle);

              cursor += angle;

              return `<path d="${d}" fill="none" stroke="${segment.color}" stroke-width="${strokeWidth}" />`;
            })
            .join("");
        })()
      : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="${strokeWidth}" />`;

  return `
    <div style="position: relative; width: ${size}px; height: ${size}px;">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${arcsHtml}</svg>
      <div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <strong style="font-size: 15px; color: #0a2a57;">${escapeHtml(centerValue)}</strong>
        <span style="font-size: 8px; color: #55627a;">${escapeHtml(centerLabel)}</span>
      </div>
    </div>
  `;
}

function buildChartLegend(segments) {
  return `
    <ul style="list-style: none; margin: 8px 0 0; padding: 0; font-size: 9px;">
      ${segments
        .map(
          (segment) => `
        <li style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 2px 0;">
          <span style="display: flex; align-items: center; gap: 5px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 999px; background: ${segment.color};"></span>
            ${escapeHtml(segment.name)}
          </span>
          <strong>${segment.value}</strong>
        </li>`
        )
        .join("")}
    </ul>
  `;
}

function formatScore(item) {
  if (item.score === null || item.score === undefined) return "—";

  return `${Number(item.score).toFixed(1)} / ${Number(item.max_score).toFixed(1)}`;
}

/**
 * @param {object} params
 * @param {object} params.detail - retorno de getEnrollmentProgressDetail
 * @param {string} params.requestedByName
 * @param {Date} params.generatedAt
 */
function render({ detail, requestedByName, generatedAt }) {
  const { enrollment, contentSummary, contents, academicSummary, academicItems, attendance } = detail;

  const contentRowsHtml = contents.length
    ? contents
        .map(
          (content) => `
    <tr>
      <td>${escapeHtml(content.title)}</td>
      <td>${escapeHtml(CONTENT_TYPE_LABEL[content.type] || content.type)}</td>
      <td>${content.isRequired ? "Obrigatório" : "Opcional"}</td>
      <td>${escapeHtml(CONTENT_STATUS_LABEL[content.progressStatus] || content.progressStatus)}</td>
      <td>${formatPercentage(content.progressPercentage)}</td>
      <td>${content.lastAccessedAt ? formatDate(content.lastAccessedAt) : "—"}</td>
    </tr>`
        )
        .join("")
    : `<tr><td colspan="6" class="empty">Nenhum conteúdo acompanhável neste curso.</td></tr>`;

  const academicRowsHtml = academicItems.length
    ? academicItems
        .map(
          (item) => `
    <tr>
      <td>${escapeHtml(item.title)}</td>
      <td>${item.activity_kind === "exam" ? "Avaliação" : "Atividade"}</td>
      <td>${item.due_date ? formatDate(item.due_date) : "—"}</td>
      <td>${escapeHtml(ACADEMIC_STATUS_LABEL[item.academic_status] || item.academic_status)}</td>
      <td>${formatScore(item)}</td>
    </tr>`
        )
        .join("")
    : `<tr><td colspan="5" class="empty">Nenhuma atividade ou avaliação neste curso.</td></tr>`;

  const contentSegments = [
    { name: "Concluídos", value: contentSummary.completedContents, color: CONTENT_CHART_COLORS[0] },
    { name: "Em andamento", value: contentSummary.inProgressContents, color: CONTENT_CHART_COLORS[1] },
    { name: "Não iniciados", value: contentSummary.notStartedContents, color: CONTENT_CHART_COLORS[2] },
  ];

  const academicSegments = [
    { name: "Corrigidas", value: academicSummary.graded_items, color: ACADEMIC_CHART_COLORS[0] },
    { name: "Aguardando correção", value: academicSummary.submitted_items, color: ACADEMIC_CHART_COLORS[1] },
    { name: "Pendentes", value: academicSummary.pending_items, color: ACADEMIC_CHART_COLORS[2] },
    { name: "Devolvidas", value: academicSummary.returned_items, color: ACADEMIC_CHART_COLORS[3] },
  ];

  const chartsHtml = `
  <section class="charts">
    <div class="chart-card">
      <h2>Progresso de conteúdo</h2>
      <div class="chart-body">
        ${buildDonutSvg({
          segments: contentSegments,
          centerValue: formatPercentage(contentSummary.progressPercentage),
          centerLabel: "concluído",
        })}
        <div class="chart-legend-wrap">${buildChartLegend(contentSegments)}</div>
      </div>
    </div>
    <div class="chart-card">
      <h2>Atividades e avaliações</h2>
      <div class="chart-body">
        ${buildDonutSvg({
          segments: academicSegments,
          centerValue: `${academicSummary.delivered_items}/${academicSummary.total_items}`,
          centerLabel: "entregues",
        })}
        <div class="chart-legend-wrap">${buildChartLegend(academicSegments)}</div>
      </div>
    </div>
  </section>`;

  const attendanceSectionHtml = attendance
    ? `
  <section>
    <h2>Frequência</h2>
    <div class="summary">
      <div class="card"><p class="label">Sessões</p><p class="value">${attendance.total}</p></div>
      <div class="card"><p class="label">Presenças</p><p class="value">${attendance.present}</p></div>
      <div class="card"><p class="label">Faltas</p><p class="value">${attendance.absent}</p></div>
      <div class="card"><p class="label">Atrasos</p><p class="value">${attendance.late}</p></div>
      <div class="card"><p class="label">Justificadas</p><p class="value">${attendance.excused}</p></div>
      <div class="card"><p class="label">Taxa de presença</p><p class="value">${formatPercentage(attendance.attendanceRate)}</p></div>
    </div>
  </section>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Progresso do aluno — ${escapeHtml(enrollment.student.name)}</title>
<style>
  * { box-sizing: border-box; }
  @page { size: A4 portrait; margin: 16mm 14mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a2233; margin: 0; font-size: 10.5px; line-height: 1.5; }
  header { border-bottom: 2px solid #0a2a57; padding-bottom: 12px; margin-bottom: 16px; }
  .brand { font-size: 14px; font-weight: 700; color: #0a2a57; margin: 0 0 6px; }
  .brand .hub { color: #f46c3c; }
  h1 { font-size: 15px; margin: 0 0 10px; color: #0a2a57; }
  table.header-info { width: 100%; border-collapse: collapse; }
  table.header-info td { padding: 3px 0; vertical-align: top; }
  table.header-info td.label { width: 30%; color: #55627a; font-size: 9.5px; }
  section { margin-bottom: 18px; }
  h2 { font-size: 12px; color: #0a2a57; margin: 0 0 8px; border-bottom: 1px solid #d7dce5; padding-bottom: 4px; }
  .summary { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
  .summary .card { flex: 1; min-width: 80px; border: 1px solid #d7dce5; border-radius: 6px; padding: 6px 8px; background: #f8fafc; }
  .summary .card .label { font-size: 7.5px; text-transform: uppercase; letter-spacing: 0.03em; color: #55627a; margin: 0 0 2px; }
  .summary .card .value { font-size: 12px; font-weight: 700; color: #0a2a57; margin: 0; font-variant-numeric: tabular-nums; }
  table.items { width: 100%; border-collapse: collapse; }
  table.items thead { display: table-header-group; }
  table.items tr { break-inside: avoid; page-break-inside: avoid; }
  table.items th { text-align: left; font-size: 8px; text-transform: uppercase; letter-spacing: 0.02em; color: #55627a; border-bottom: 1.5px solid #0a2a57; padding: 4px 5px; }
  table.items td { padding: 4px 5px; border-bottom: 1px solid #e5e9f0; font-size: 9.5px; }
  table.items td.empty { text-align: center; color: #8a93a6; padding: 12px 0; }
  footer { margin-top: 16px; font-size: 8px; color: #8a93a6; border-top: 1px solid #e5e9f0; padding-top: 8px; }
  .charts { display: flex; gap: 14px; break-inside: avoid; page-break-inside: avoid; }
  .chart-card { flex: 1; border: 1px solid #d7dce5; border-radius: 8px; padding: 10px; }
  .chart-body { display: flex; align-items: center; gap: 12px; }
  .chart-legend-wrap { flex: 1; min-width: 0; }
</style>
</head>
<body>
  <header>
    <p class="brand">Course<span class="hub">Hub</span></p>
    <h1>Relatório de progresso do aluno</h1>
    <table class="header-info">
      <tr><td class="label">Aluno</td><td>${escapeHtml(enrollment.student.name)}${enrollment.student.registrationNumber ? ` · Matrícula ${escapeHtml(enrollment.student.registrationNumber)}` : ""}</td></tr>
      <tr><td class="label">Curso</td><td>${escapeHtml(enrollment.course.name)}</td></tr>
      <tr><td class="label">Turma</td><td>${enrollment.class ? escapeHtml(enrollment.class.name) : "—"}</td></tr>
      <tr><td class="label">Status da matrícula</td><td>${escapeHtml(ENROLLMENT_STATUS_LABEL[enrollment.status] || enrollment.status)}</td></tr>
      <tr><td class="label">Matriculado em</td><td>${formatDate(enrollment.enrolledAt)}</td></tr>
    </table>
  </header>

  ${chartsHtml}

  <section>
    <h2>Progresso de conteúdo</h2>
    <div class="summary">
      <div class="card"><p class="label">Concluídos</p><p class="value">${contentSummary.completedContents}</p></div>
      <div class="card"><p class="label">Em andamento</p><p class="value">${contentSummary.inProgressContents}</p></div>
      <div class="card"><p class="label">Não iniciados</p><p class="value">${contentSummary.notStartedContents}</p></div>
      <div class="card"><p class="label">Total considerado</p><p class="value">${contentSummary.totalContents}</p></div>
      <div class="card"><p class="label">Percentual</p><p class="value">${formatPercentage(contentSummary.progressPercentage)}</p></div>
    </div>
    <table class="items">
      <thead><tr><th>Conteúdo</th><th>Tipo</th><th>Obrigatório</th><th>Status</th><th>Percentual</th><th>Último acesso</th></tr></thead>
      <tbody>${contentRowsHtml}</tbody>
    </table>
  </section>

  <section>
    <h2>Atividades e avaliações</h2>
    <div class="summary">
      <div class="card"><p class="label">Total</p><p class="value">${academicSummary.total_items}</p></div>
      <div class="card"><p class="label">Entregues</p><p class="value">${academicSummary.delivered_items}</p></div>
      <div class="card"><p class="label">Pendentes</p><p class="value">${academicSummary.pending_items}</p></div>
      <div class="card"><p class="label">Atrasadas</p><p class="value">${academicSummary.overdue_items}</p></div>
      <div class="card"><p class="label">Corrigidas</p><p class="value">${academicSummary.graded_items}</p></div>
      <div class="card"><p class="label">Devolvidas</p><p class="value">${academicSummary.returned_items}</p></div>
      <div class="card"><p class="label">Média</p><p class="value">${academicSummary.average_grade !== null ? academicSummary.average_grade.toFixed(1) : "—"}</p></div>
    </div>
    <table class="items">
      <thead><tr><th>Título</th><th>Tipo</th><th>Prazo</th><th>Status</th><th>Nota</th></tr></thead>
      <tbody>${academicRowsHtml}</tbody>
    </table>
  </section>

  ${attendanceSectionHtml}

  <footer>${escapeHtml(INSTITUTION.tradeName)} · Relatório gerado eletronicamente · Solicitado por ${escapeHtml(requestedByName)} em ${formatDateTime(generatedAt)}</footer>
</body>
</html>`;
}

module.exports = { render };
