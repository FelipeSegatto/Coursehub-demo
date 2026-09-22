/**
 * Exporta a listagem de notas (mesma tela/filtros de
 * GET /api/admin/grades) como PDF. Média calculada sobre o conjunto
 * filtrado, não sobre getGradesSummary (global/sem filtro).
 */
const { listGrades } = require("../admin/adminGradeService");
const { renderHtmlToPdf } = require("../documents/documentRendererService");
const { fetchAllFilteredRows, getRequesterName, DEFAULT_ROW_CAP } = require("./reportDataHelpers");
const gradesReportTemplate = require("./templates/gradesReportTemplate");

function buildFilterLines(filters) {
  const lines = [];

  if (filters.courseId) lines.push(`Curso: #${filters.courseId}`);
  if (filters.classId) lines.push(`Turma: #${filters.classId}`);
  if (filters.teacherId) lines.push(`Professor: #${filters.teacherId}`);
  if (filters.activityId) lines.push(`Atividade: #${filters.activityId}`);
  if (filters.adjustedOnly === "true" || filters.adjustedOnly === true) lines.push("Somente ajustadas manualmente");
  if (filters.search) lines.push(`Busca: "${filters.search}"`);

  return lines;
}

async function generateGradesReportPdf(db, { filters = {}, actorUserId }) {
  const rowCap = DEFAULT_ROW_CAP;

  const [{ rows: grades }, requestedByName] = await Promise.all([
    fetchAllFilteredRows(listGrades, db, filters, { rowCap, dataKey: "data" }),
    getRequesterName(db, actorUserId),
  ]);

  const generatedAt = new Date();

  const html = gradesReportTemplate.render({
    grades,
    filterLines: buildFilterLines(filters),
    requestedByName,
    generatedAt,
    rowCap,
  });

  const buffer = await renderHtmlToPdf(html);

  return {
    buffer,
    filename: `relatorio-notas-${generatedAt.toISOString().slice(0, 10)}.pdf`,
  };
}

module.exports = { generateGradesReportPdf };
