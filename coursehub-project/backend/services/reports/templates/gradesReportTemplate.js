const { escapeHtml, formatDate } = require("../../documents/templateHelpers");
const { renderReportDocument } = require("../reportTemplateHelpers");

/**
 * @param {object} params
 * @param {object[]} params.grades - formato de mapGradeRow (listGrades)
 */
function render({ grades, filterLines, requestedByName, generatedAt, rowCap }) {
  const scored = grades.filter((grade) => grade.score !== null && grade.score !== undefined);
  const averageScore =
    scored.length > 0
      ? (scored.reduce((sum, grade) => sum + Number(grade.score), 0) / scored.length).toFixed(1)
      : "—";

  const tableHeadHtml = `
    <th>Aluno</th>
    <th>Curso</th>
    <th>Turma</th>
    <th>Atividade</th>
    <th>Professor</th>
    <th>Nota</th>
    <th>Corrigido em</th>
  `;

  const tableBodyHtml = grades
    .map(
      (grade) => `
    <tr>
      <td>${escapeHtml(grade.student.name)}</td>
      <td>${escapeHtml(grade.course.name)}</td>
      <td>${escapeHtml(grade.class?.name || "—")}</td>
      <td>${escapeHtml(grade.activity.title)}</td>
      <td>${escapeHtml(grade.teacher?.name || "—")}</td>
      <td>${grade.score ?? "—"} / ${grade.maxScore ?? "—"}</td>
      <td>${formatDate(grade.gradedAt)}</td>
    </tr>`
    )
    .join("");

  return renderReportDocument({
    title: "Relatório de notas e desempenho",
    filterLines,
    requestedByName,
    generatedAt,
    summaryCards: [
      { label: "Total de lançamentos", value: String(grades.length) },
      { label: "Média das notas", value: averageScore },
    ],
    tableHeadHtml,
    tableBodyHtml,
    rowCount: grades.length,
    rowCap,
  });
}

module.exports = { render };
