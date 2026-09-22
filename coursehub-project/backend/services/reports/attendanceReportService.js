/**
 * Exporta a listagem de frequência (mesma tela/filtros de
 * GET /api/admin/attendance) como PDF. Totais calculados sobre o
 * conjunto filtrado -- getAttendanceSummary (usado pela tela) é
 * global/sem filtro.
 */
const { listAttendance } = require("../admin/adminAttendanceService");
const { renderHtmlToPdf } = require("../documents/documentRendererService");
const { fetchAllFilteredRows, getRequesterName, DEFAULT_ROW_CAP } = require("./reportDataHelpers");
const attendanceReportTemplate = require("./templates/attendanceReportTemplate");

const STATUS_LABEL = {
  present: "Presente",
  absent: "Ausente",
  late: "Atrasado",
  excused: "Justificado",
};

function buildFilterLines(filters) {
  const lines = [];

  if (filters.status) lines.push(`Status: ${STATUS_LABEL[filters.status] || filters.status}`);
  if (filters.courseId) lines.push(`Curso: #${filters.courseId}`);
  if (filters.classId) lines.push(`Turma: #${filters.classId}`);
  if (filters.from || filters.to) lines.push(`Período: ${filters.from || "início"} a ${filters.to || "hoje"}`);
  if (filters.adjustedOnly === "true" || filters.adjustedOnly === true) lines.push("Somente ajustados manualmente");
  if (filters.search) lines.push(`Busca: "${filters.search}"`);

  return lines;
}

async function generateAttendanceReportPdf(db, { filters = {}, actorUserId }) {
  const rowCap = DEFAULT_ROW_CAP;

  const [{ rows: attendanceRecords }, requestedByName] = await Promise.all([
    fetchAllFilteredRows(listAttendance, db, filters, { rowCap, dataKey: "data" }),
    getRequesterName(db, actorUserId),
  ]);

  const generatedAt = new Date();

  const html = attendanceReportTemplate.render({
    attendanceRecords,
    filterLines: buildFilterLines(filters),
    requestedByName,
    generatedAt,
    rowCap,
  });

  const buffer = await renderHtmlToPdf(html);

  return {
    buffer,
    filename: `relatorio-frequencia-${generatedAt.toISOString().slice(0, 10)}.pdf`,
  };
}

module.exports = { generateAttendanceReportPdf };
