const { escapeHtml, formatDate } = require("../../documents/templateHelpers");
const { renderReportDocument } = require("../reportTemplateHelpers");

const STATUS_LABEL = {
  present: "Presente",
  absent: "Ausente",
  late: "Atrasado",
  excused: "Justificado",
};

/**
 * @param {object} params
 * @param {object[]} params.attendanceRecords - formato de mapAttendanceRow (listAttendance)
 */
function render({ attendanceRecords, filterLines, requestedByName, generatedAt, rowCap }) {
  const byStatus = attendanceRecords.reduce((acc, record) => {
    acc[record.status] = (acc[record.status] || 0) + 1;
    return acc;
  }, {});

  const presentCount = byStatus.present || 0;
  const attendanceRate =
    attendanceRecords.length > 0 ? `${((presentCount / attendanceRecords.length) * 100).toFixed(1)}%` : "—";

  const tableHeadHtml = `
    <th>Aluno</th>
    <th>Curso</th>
    <th>Turma</th>
    <th>Sessão</th>
    <th>Data</th>
    <th>Status</th>
  `;

  const tableBodyHtml = attendanceRecords
    .map(
      (record) => `
    <tr>
      <td>${escapeHtml(record.student.name)}</td>
      <td>${escapeHtml(record.course.name)}</td>
      <td>${escapeHtml(record.class.name)}</td>
      <td>${escapeHtml(record.session.title || "")}</td>
      <td>${formatDate(record.session.date)}</td>
      <td>${escapeHtml(STATUS_LABEL[record.status] || record.status)}</td>
    </tr>`
    )
    .join("");

  return renderReportDocument({
    title: "Relatório de frequência",
    filterLines,
    requestedByName,
    generatedAt,
    summaryCards: [
      { label: "Total de registros", value: String(attendanceRecords.length) },
      { label: "Presentes", value: String(presentCount) },
      { label: "Ausentes", value: String(byStatus.absent || 0) },
      { label: "Atrasados", value: String(byStatus.late || 0) },
      { label: "Justificados", value: String(byStatus.excused || 0) },
      { label: "Taxa de presença", value: attendanceRate },
    ],
    tableHeadHtml,
    tableBodyHtml,
    rowCount: attendanceRecords.length,
    rowCap,
  });
}

module.exports = { render };
