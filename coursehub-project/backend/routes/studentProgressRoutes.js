const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  getAcademicProgress,
  getProgressOverview,
} = require("../services/students/studentProgressService");

const router = express.Router();

/**
 * GET /api/students/by-user/:userId/courses/:courseId/academic-progress
 * Identidade sempre vem do token — nunca da URL.
 */
router.get(
  "/students/by-user/:userId/courses/:courseId/academic-progress",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const result = await getAcademicProgress(db, {
        userId: req.auth.userId,
        courseId: req.params.courseId,
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error("Erro ao buscar progresso acadêmico do curso:", error);

      return res.status(error.statusCode || 500).json({
        message: error.statusCode
          ? error.message
          : "Erro ao buscar o progresso acadêmico do curso.",
      });
    }
  }
);

/**
 * GET /api/students/by-user/:userId/progress-overview
 * Identidade sempre vem do token — nunca da URL.
 */
router.get(
  "/students/by-user/:userId/progress-overview",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const result = await getProgressOverview(db, {
        userId: req.auth.userId,
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error("Erro ao buscar visão geral do progresso:", error);

      return res.status(error.statusCode || 500).json({
        message: error.statusCode
          ? error.message
          : "Erro ao buscar a visão geral do progresso.",
      });
    }
  }
);

module.exports = router;
