const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  listTeacherActivities,
  getTeacherActivityDetail,
  createActivity,
  updateActivity,
  deactivateActivity,
} = require("../services/activities/teacherActivityService");

const {
  listActivitySubmissions,
  getSubmissionFull,
} = require("../services/activities/activitySubmissionService");

const {
  gradeSubmission,
  quickGradeSubmission,
} = require("../services/activities/activityGradingService");

const router = express.Router();

/**
 * POST /api/activities
 */
router.post(
  "/activities",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const result = await createActivity(db, {
        userId: req.auth.userId,
        payload: req.body,
      });

      return res.status(201).json(result);
    } catch (error) {
      console.error("Erro completo ao criar atividade:", error);

      return res.status(error.statusCode || 500).json({
        message: error.statusCode
          ? error.message
          : "Erro ao criar atividade.",
        error: error.message,
        code: error.code,
        sqlMessage: error.sqlMessage,
      });
    }
  }
);

/**
 * GET /api/teacher/by-user/:userId/activities
 */
router.get(
  "/teacher/by-user/:userId/activities",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const activities = await listTeacherActivities(db, {
        userId: req.auth.userId,
      });

      return res.status(200).json(activities);
    } catch (error) {
      console.error("Erro ao buscar atividades do professor:", error);

      return res.status(error.statusCode || 500).json({
        message:
          error.message || "Erro ao buscar atividades do professor.",
        error: error.message,
        code: error.code,
        sqlMessage: error.sqlMessage,
      });
    }
  }
);

/**
 * GET /api/teacher/by-user/:userId/activities/:activityId/full
 */
router.get(
  "/teacher/by-user/:userId/activities/:activityId/full",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const activity = await getTeacherActivityDetail(db, {
        userId: req.auth.userId,
        activityId: req.params.activityId,
      });

      return res.status(200).json(activity);
    } catch (error) {
      console.error("Erro ao buscar atividade completa:", error);

      return res.status(error.statusCode || 500).json({
        message:
          error.message ||
          "Erro ao buscar os dados completos da atividade.",
        error: error.message,
        code: error.code,
        sqlMessage: error.sqlMessage,
      });
    }
  }
);

/**
 * PUT /api/teacher/by-user/:userId/activities/:activityId
 */
router.put(
  "/teacher/by-user/:userId/activities/:activityId",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const result = await updateActivity(db, {
        userId: req.auth.userId,
        activityId: req.params.activityId,
        payload: req.body,
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error("Erro ao atualizar atividade:", error);

      return res.status(error.statusCode || 500).json({
        message: error.statusCode
          ? error.message
          : "Erro ao atualizar atividade.",
        error: error.message,
        code: error.code,
        sqlMessage: error.sqlMessage,
        ...(error.extra || {}),
      });
    }
  }
);

/**
 * DELETE /api/activities/:id
 * Soft delete — desativa a atividade sem removê-la do banco.
 */
router.delete(
  "/activities/:id",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const result = await deactivateActivity(db, {
        userId: req.auth.userId,
        activityId: req.params.id,
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error("Erro ao desativar atividade:", error);

      return res.status(error.statusCode || 500).json({
        message: error.message || "Erro ao desativar atividade.",
        error: error.message,
      });
    }
  }
);

/**
 * GET /api/teacher/by-user/:userId/activities/:activityId/submissions
 * Aceita classId opcional na query string — só tem efeito em
 * atividades gerais; em atividades específicas o filtro é sempre
 * a turma da própria atividade.
 */
router.get(
  "/teacher/by-user/:userId/activities/:activityId/submissions",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const result = await listActivitySubmissions(db, {
        userId: req.auth.userId,
        activityId: req.params.activityId,
        classId: req.query.classId,
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error("Erro ao buscar submissions da atividade:", error);

      return res.status(error.statusCode || 500).json({
        message:
          error.message || "Erro ao buscar envios da atividade.",
        error: error.message,
        code: error.code,
        sqlMessage: error.sqlMessage,
      });
    }
  }
);

/**
 * GET /api/teacher/by-user/:userId/submissions/:submissionId/full
 */
router.get(
  "/teacher/by-user/:userId/submissions/:submissionId/full",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const result = await getSubmissionFull(db, {
        userId: req.auth.userId,
        submissionId: req.params.submissionId,
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error("Erro ao buscar submission completa:", error);

      return res.status(error.statusCode || 500).json({
        message: error.message || "Erro ao buscar entrega completa.",
        error: error.message,
        code: error.code,
        sqlMessage: error.sqlMessage,
      });
    }
  }
);

/**
 * PUT /api/teacher/by-user/:userId/submissions/:submissionId/grade
 */
router.put(
  "/teacher/by-user/:userId/submissions/:submissionId/grade",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const { answers, feedback } = req.body;

      const result = await gradeSubmission(db, {
        userId: req.auth.userId,
        submissionId: req.params.submissionId,
        answers,
        feedback,
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error("Erro ao salvar a correção:", error);

      return res.status(error.statusCode || 500).json({
        message: error.message || "Erro ao salvar a correção.",
        error: error.message,
        code: error.code,
        sqlMessage: error.sqlMessage,
      });
    }
  }
);

/**
 * PATCH /api/teacher/by-user/:userId/submissions/:submissionId/quick-grade
 * Sobrescrita rápida da nota total, sem passar pela correção por
 * questão — usada pela planilha de notas do professor.
 */
router.patch(
  "/teacher/by-user/:userId/submissions/:submissionId/quick-grade",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const { score, feedback } = req.body;

      const result = await quickGradeSubmission(db, {
        userId: req.auth.userId,
        submissionId: req.params.submissionId,
        score,
        feedback,
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error("Erro ao sobrescrever a nota:", error);

      return res.status(error.statusCode || 500).json({
        message: error.message || "Erro ao sobrescrever a nota.",
        error: error.message,
        code: error.code,
        sqlMessage: error.sqlMessage,
      });
    }
  }
);

module.exports = router;
