const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  listStudentActivities,
  getStudentActivityDetail,
  submitActivityAnswers,
} = require("../services/activities/studentActivityService");

const {
  getStudentGrades,
} = require("../services/activities/activityGradingService");

const router = express.Router();

/**
 * GET /api/students/by-user/activities
 * Identidade sempre vem do token — a URL não usa :userId.
 */
router.get(
  "/students/by-user/activities",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const activities = await listStudentActivities(db, {
        userId: req.auth.userId,
      });

      return res.status(200).json(activities);
    } catch (error) {
      console.error("Erro ao buscar atividades do aluno:", error);

      return res.status(error.statusCode || 500).json({
        message:
          error.message || "Erro ao buscar atividades do aluno.",
      });
    }
  }
);

/**
 * GET /api/students/by-user/activities/:activityId/full
 */
router.get(
  "/students/by-user/activities/:activityId/full",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const activity = await getStudentActivityDetail(db, {
        userId: req.auth.userId,
        activityId: req.params.activityId,
      });

      return res.status(200).json(activity);
    } catch (error) {
      console.error("Erro ao buscar atividade do aluno:", error);

      return res.status(error.statusCode || 500).json({
        message: error.message || "Erro ao buscar atividade.",
      });
    }
  }
);

/**
 * POST /api/students/activities/:activityId/submissions
 */
router.post(
  "/students/activities/:activityId/submissions",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const { answers, fullscreen_exit_count: fullscreenExitCount } =
        req.body;

      const result = await submitActivityAnswers(db, {
        userId: req.auth.userId,
        activityId: req.params.activityId,
        answers,
        fullscreenExitCount,
      });

      return res.status(201).json(result);
    } catch (error) {
      console.error("Erro ao enviar atividade:", error);

      return res.status(error.statusCode || 500).json({
        message: error.message || "Erro ao enviar atividade.",
      });
    }
  }
);

/**
 * GET /api/students/by-user/:userId/grades
 */
router.get(
  "/students/by-user/:userId/grades",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const grades = await getStudentGrades(db, {
        userId: req.auth.userId,
      });

      return res.status(200).json(grades);
    } catch (error) {
      console.error("Erro ao buscar notas do aluno:", error);

      return res.status(error.statusCode || 500).json({
        message: error.message || "Erro ao buscar notas do aluno.",
        error: error.message,
      });
    }
  }
);

module.exports = router;
