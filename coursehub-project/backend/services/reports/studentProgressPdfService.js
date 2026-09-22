/**
 * Exporta o progresso de UMA matrícula em PDF -- relatório
 * operacional atual, não documento formal (sem generated_documents,
 * sem worker, sem storage permanente, sem QR/versionamento). Gerado a
 * partir do mesmo DTO seguro do detalhe (getEnrollmentProgressDetail),
 * nunca de HTML/valores vindos do cliente.
 *
 * Recebe `detail` já resolvido pelo chamador (não busca por
 * enrollmentId aqui) para que a checagem de propriedade -- admin sem
 * restrição, professor só das próprias turmas -- fique inteiramente a
 * cargo de quem chama, sem risco de um caminho "esquecer" o escopo.
 */
const { renderHtmlToPdf } = require("../documents/documentRendererService");
const { getRequesterName } = require("./reportDataHelpers");
const studentProgressPdfTemplate = require("./templates/studentProgressPdfTemplate");

async function generateStudentProgressPdf(db, { detail, actorUserId }) {
  const requestedByName = await getRequesterName(db, actorUserId);

  const generatedAt = new Date();

  const html = studentProgressPdfTemplate.render({ detail, requestedByName, generatedAt });

  const buffer = await renderHtmlToPdf(html);

  return {
    buffer,
    filename: `progresso-aluno-${detail.enrollment.id}.pdf`,
  };
}

module.exports = { generateStudentProgressPdf };
