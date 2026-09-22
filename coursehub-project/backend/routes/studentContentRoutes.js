const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  getStudentCourseContents,
} = require("../services/courseContents/studentCourseContentService");

const {
  getCourseProgressForStudent,
  updateContentProgress,
} = require("../services/courseContents/courseContentProgressService");

const router = express.Router();

/**
 * GET /api/students/courses/:courseId/contents
 * Conteúdos visíveis para o aluno autenticado: gerais do curso +
 * exclusivos da turma da sua matrícula ativa.
 */
router.get(
  "/students/courses/:courseId/contents",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const result = await getStudentCourseContents(db, {
        userId: req.auth.userId,
        courseId: req.params.courseId,
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error(
        "Erro ao buscar conteúdos do curso para o aluno:",
        error
      );

      return res.status(error.statusCode || 500).json({
        message:
          error.message || "Erro ao buscar conteúdos do curso.",
      });
    }
  }
);

/**
 * GET /api/students/by-user/:userId/courses/:courseId/progress
 * Identidade sempre vem do token — nunca da URL.
 */
router.get(
  "/students/by-user/:userId/courses/:courseId/progress",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const result = await getCourseProgressForStudent(db, {
        userId: req.auth.userId,
        courseId: req.params.courseId,
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error("Erro ao buscar progresso do curso:", error);

      return res.status(error.statusCode || 500).json({
        message:
          error.message || "Erro ao buscar o progresso do curso.",
      });
    }
  }
);

/**
 * PUT /api/students/by-user/:userId/contents/:contentId/progress
 * Identidade sempre vem do token — nunca da URL.
 */
router.put(
  "/students/by-user/:userId/contents/:contentId/progress",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const {
        status,
        progress_percentage: progressPercentage,
        last_position_seconds: lastPositionSeconds,
      } = req.body;

      const result = await updateContentProgress(db, {
        userId: req.auth.userId,
        contentId: req.params.contentId,
        status,
        progressPercentage,
        lastPositionSeconds,
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error(
        "Erro ao atualizar progresso do conteúdo:",
        error
      );

      return res.status(error.statusCode || 500).json({
        message:
          error.message ||
          "Erro ao atualizar o progresso do conteúdo.",
      });
    }
  }
);

module.exports = router;
