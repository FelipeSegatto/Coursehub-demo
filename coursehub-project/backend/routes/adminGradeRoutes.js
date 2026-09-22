const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const { listGrades, getGradeById, adjustGrade } = require("../services/admin/adminGradeService");

const router = express.Router();

function handleServiceError(res, error, fallbackMessage) {
  console.error(fallbackMessage, error);

  if (error.statusCode) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  return res.status(500).json({
    message: fallbackMessage,
    error: error.message,
    code: error.code,
    sqlMessage: error.sqlMessage,
  });
}

/**
 * GET /api/admin/grades
 */
router.get(
  "/admin/grades",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await listGrades(db, req.query);

      return res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao buscar notas.");
    }
  }
);

/**
 * GET /api/admin/grades/:gradeId
 */
router.get(
  "/admin/grades/:gradeId",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const grade = await getGradeById(db, req.params.gradeId);

      return res.status(200).json(grade);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao buscar nota.");
    }
  }
);

/**
 * PATCH /api/admin/grades/:gradeId/adjust
 */
router.patch(
  "/admin/grades/:gradeId/adjust",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const grade = await adjustGrade(
        db,
        req.params.gradeId,
        { score: req.body.score, reason: req.body.reason },
        req.auth.userId
      );

      return res.status(200).json({
        message: "Nota ajustada com sucesso.",
        grade,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao ajustar nota.");
    }
  }
);

module.exports = router;
