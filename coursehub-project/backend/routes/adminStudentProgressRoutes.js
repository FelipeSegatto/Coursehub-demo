const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");
const { reportExportRateLimiter } = require("../middlewares/rateLimiters");

const { listEnrollmentsForProgress, getEnrollmentProgressDetail } = require("../services/admin/adminStudentProgressService");
const { generateStudentProgressPdf } = require("../services/reports/studentProgressPdfService");

const router = express.Router();

function handleServiceError(res, error, fallbackMessage) {
  console.error(fallbackMessage, error);

  if (error.statusCode) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  return res.status(500).json({ message: fallbackMessage });
}

/**
 * GET /api/admin/student-progress
 */
router.get("/admin/student-progress", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const result = await listEnrollmentsForProgress(db, req.query);

    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error, "Erro ao buscar progressão dos alunos.");
  }
});

/**
 * GET /api/admin/student-progress/enrollments/:enrollmentId
 */
router.get(
  "/admin/student-progress/enrollments/:enrollmentId",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await getEnrollmentProgressDetail(db, req.params.enrollmentId);

      return res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao buscar o progresso da matrícula.");
    }
  }
);

/**
 * GET /api/admin/student-progress/enrollments/:enrollmentId/export.pdf
 */
router.get(
  "/admin/student-progress/enrollments/:enrollmentId/export.pdf",
  authenticateToken,
  authorizeRoles("admin"),
  reportExportRateLimiter,
  async (req, res) => {
    try {
      const detail = await getEnrollmentProgressDetail(db, req.params.enrollmentId);

      const { buffer, filename } = await generateStudentProgressPdf(db, {
        detail,
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
      console.error("Erro ao gerar PDF de progresso do aluno:", error);

      return res.status(error.statusCode || 500).json({
        message: error.statusCode ? error.message : "Erro interno ao gerar o PDF.",
      });
    }
  }
);

module.exports = router;
