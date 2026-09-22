/**
 * Exporta o progresso acadêmico (conteúdos) das matrículas ativas
 * como PDF. Diferente dos outros 4 relatórios, não existia tela
 * admin nem endpoint JSON para essa consulta antes desta fase --
 * listAcademicProgress (services/admin/adminAcademicProgressService.js)
 * é uma consulta nova, criada junto com este relatório.
 */
const { listAcademicProgress } = require("../admin/adminAcademicProgressService");
const { renderHtmlToPdf } = require("../documents/documentRendererService");
const { fetchAllFilteredRows, getRequesterName, DEFAULT_ROW_CAP } = require("./reportDataHelpers");
const academicProgressReportTemplate = require("./templates/academicProgressReportTemplate");

function buildFilterLines(filters) {
  const lines = [];

  if (filters.courseId) lines.push(`Curso: #${filters.courseId}`);
  if (filters.classId) lines.push(`Turma: #${filters.classId}`);
  if (filters.search) lines.push(`Busca: "${filters.search}"`);
  lines.push("Somente matrículas ativas");

  return lines;
}

async function generateAcademicProgressReportPdf(db, { filters = {}, actorUserId }) {
  const rowCap = DEFAULT_ROW_CAP;

  const [{ rows: progressRows }, requestedByName] = await Promise.all([
    fetchAllFilteredRows(listAcademicProgress, db, filters, { rowCap, dataKey: "data" }),
    getRequesterName(db, actorUserId),
  ]);

  const generatedAt = new Date();

  const html = academicProgressReportTemplate.render({
    progressRows,
    filterLines: buildFilterLines(filters),
    requestedByName,
    generatedAt,
    rowCap,
  });

  const buffer = await renderHtmlToPdf(html);

  return {
    buffer,
    filename: `relatorio-progresso-academico-${generatedAt.toISOString().slice(0, 10)}.pdf`,
  };
}

module.exports = { generateAcademicProgressReportPdf };
