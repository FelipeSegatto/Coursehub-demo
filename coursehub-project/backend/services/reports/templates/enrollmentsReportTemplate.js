const { escapeHtml, formatDate } = require("../../documents/templateHelpers");
const { renderReportDocument } = require("../reportTemplateHelpers");

const STATUS_LABEL = {
  active: "Ativa",
  inactive: "Inativa",
  completed: "Concluída",
  cancelled: "Cancelada",
};

/**
 * @param {object} params
 * @param {object[]} params.enrollments - formato de mapEnrollmentRow (listEnrollments)
 */
function render({ enrollments, filterLines, requestedByName, generatedAt, rowCap }) {
  const byStatus = enrollments.reduce((acc, enrollment) => {
    acc[enrollment.status] = (acc[enrollment.status] || 0) + 1;
    return acc;
  }, {});

  const tableHeadHtml = `
    <th>Aluno</th>
    <th>Matrícula</th>
    <th>Curso</th>
    <th>Turma</th>
    <th>Status</th>
    <th>Matriculado em</th>
  `;

  const tableBodyHtml = enrollments
    .map(
      (enrollment) => `
    <tr>
      <td>${escapeHtml(enrollment.student.name)}</td>
      <td>${escapeHtml(enrollment.student.registrationNumber || "")}</td>
      <td>${escapeHtml(enrollment.course.name)}</td>
      <td>${escapeHtml(enrollment.class?.name || "—")}</td>
      <td>${escapeHtml(STATUS_LABEL[enrollment.status] || enrollment.status)}</td>
      <td>${formatDate(enrollment.enrolledAt)}</td>
    </tr>`
    )
    .join("");

  return renderReportDocument({
    title: "Relatório de matrículas",
    filterLines,
    requestedByName,
    generatedAt,
    summaryCards: [
      { label: "Total de matrículas", value: String(enrollments.length) },
      { label: "Ativas", value: String(byStatus.active || 0) },
      { label: "Concluídas", value: String(byStatus.completed || 0) },
      { label: "Canceladas", value: String(byStatus.cancelled || 0) },
    ],
    tableHeadHtml,
    tableBodyHtml,
    rowCount: enrollments.length,
    rowCap,
  });
}

module.exports = { render };
