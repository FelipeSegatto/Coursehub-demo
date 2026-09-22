/**
 * Exporta a listagem de matrículas (mesma tela/filtros de
 * GET /api/admin/enrollments) como PDF. Totais calculados aqui sobre
 * o conjunto filtrado -- getEnrollmentsSummary (usado pela tela) é
 * global/sem filtro, não serviria para o rodapé de um PDF filtrado.
 */
const { listEnrollments } = require("../admin/adminEnrollmentService");
const { renderHtmlToPdf } = require("../documents/documentRendererService");
const { fetchAllFilteredRows, getRequesterName, DEFAULT_ROW_CAP } = require("./reportDataHelpers");
const enrollmentsReportTemplate = require("./templates/enrollmentsReportTemplate");

const STATUS_LABEL = {
  active: "Ativa",
  inactive: "Inativa",
  completed: "Concluída",
  cancelled: "Cancelada",
};

function buildFilterLines(filters) {
  const lines = [];

  if (filters.status) lines.push(`Status: ${STATUS_LABEL[filters.status] || filters.status}`);
  if (filters.courseId) lines.push(`Curso: #${filters.courseId}`);
  if (filters.classId) lines.push(`Turma: #${filters.classId}`);
  if (filters.studentId) lines.push(`Aluno: #${filters.studentId}`);
  if (filters.from || filters.to) lines.push(`Período: ${filters.from || "início"} a ${filters.to || "hoje"}`);
  if (filters.search) lines.push(`Busca: "${filters.search}"`);

  return lines;
}

async function generateEnrollmentsReportPdf(db, { filters = {}, actorUserId }) {
  const rowCap = DEFAULT_ROW_CAP;

  const [{ rows: enrollments }, requestedByName] = await Promise.all([
    fetchAllFilteredRows(listEnrollments, db, filters, { rowCap, dataKey: "data" }),
    getRequesterName(db, actorUserId),
  ]);

  const generatedAt = new Date();

  const html = enrollmentsReportTemplate.render({
    enrollments,
    filterLines: buildFilterLines(filters),
    requestedByName,
    generatedAt,
    rowCap,
  });

  const buffer = await renderHtmlToPdf(html);

  return {
    buffer,
    filename: `relatorio-matriculas-${generatedAt.toISOString().slice(0, 10)}.pdf`,
  };
}

module.exports = { generateEnrollmentsReportPdf };
