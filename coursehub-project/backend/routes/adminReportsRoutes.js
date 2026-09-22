/**
 * Exportação de relatórios operacionais em PDF -- financeiro,
 * matrículas, frequência, notas e progresso acadêmico. Diferente das
 * rotas de documento formal (mountDocumentAccessRoutes), aqui a
 * geração é síncrona: uma única GET com os mesmos filtros da tela
 * já devolve o PDF pronto, sem fila, sem storage em disco, sem
 * registro em generated_documents -- é uma consulta reproduzível, não
 * um documento oficial (ver Fase 3 do plano de documentos em PDF).
 */
const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");
const { reportExportRateLimiter } = require("../middlewares/rateLimiters");

const { generateFinancialInvoicesReportPdf } = require("../services/reports/financialInvoicesReportService");
const { generateEnrollmentsReportPdf } = require("../services/reports/enrollmentsReportService");
const { generateAttendanceReportPdf } = require("../services/reports/attendanceReportService");
const { generateGradesReportPdf } = require("../services/reports/gradesReportService");
const { generateAcademicProgressReportPdf } = require("../services/reports/academicProgressReportService");

const router = express.Router();

function mountReportExportRoute(routePath, generatePdf) {
  router.get(routePath, authenticateToken, authorizeRoles("admin"), reportExportRateLimiter, async (req, res) => {
    try {
      const { buffer, filename } = await generatePdf(db, {
        filters: req.query,
        actorUserId: req.auth.userId,
      });

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      });

      return res.status(200).send(buffer);
    } catch (error) {
      console.error(`Erro ao gerar relatório (${routePath}):`, error);

      return res.status(error.statusCode || 500).json({
        message: error.statusCode ? error.message : "Erro interno ao gerar o relatório.",
      });
    }
  });
}

mountReportExportRoute("/financial-invoices", generateFinancialInvoicesReportPdf);
mountReportExportRoute("/enrollments", generateEnrollmentsReportPdf);
mountReportExportRoute("/attendance", generateAttendanceReportPdf);
mountReportExportRoute("/grades", generateGradesReportPdf);
mountReportExportRoute("/academic-progress", generateAcademicProgressReportPdf);

module.exports = router;
