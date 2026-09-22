const { escapeHtml } = require("../../documents/templateHelpers");
const { renderReportDocument } = require("../reportTemplateHelpers");

/**
 * @param {object} params
 * @param {object[]} params.progressRows - formato de mapProgressRow (listAcademicProgress)
 */
function render({ progressRows, filterLines, requestedByName, generatedAt, rowCap }) {
  const averagePercentage =
    progressRows.length > 0
      ? (progressRows.reduce((sum, row) => sum + row.progressPercentage, 0) / progressRows.length).toFixed(1)
      : "—";

  const completedCount = progressRows.filter((row) => row.progressPercentage >= 100).length;

  const tableHeadHtml = `
    <th>Aluno</th>
    <th>Curso</th>
    <th>Turma</th>
    <th>Conteúdos concluídos</th>
    <th>Progresso</th>
  `;

  const tableBodyHtml = progressRows
    .map(
      (row) => `
    <tr>
      <td>${escapeHtml(row.student.name)}</td>
      <td>${escapeHtml(row.course.name)}</td>
      <td>${escapeHtml(row.class?.name || "—")}</td>
      <td>${row.completedContents} / ${row.totalContents}</td>
      <td>${row.progressPercentage.toFixed(1)}%</td>
    </tr>`
    )
    .join("");

  return renderReportDocument({
    title: "Relatório de progresso acadêmico",
    filterLines,
    requestedByName,
    generatedAt,
    summaryCards: [
      { label: "Matrículas avaliadas", value: String(progressRows.length) },
      { label: "Progresso médio", value: `${averagePercentage}%` },
      { label: "Concluídos (100%)", value: String(completedCount) },
    ],
    tableHeadHtml,
    tableBodyHtml,
    rowCount: progressRows.length,
    rowCap,
  });
}

module.exports = { render };
