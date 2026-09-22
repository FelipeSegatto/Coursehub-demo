const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  getLegacyDateAttendance,
  getSessionAttendance,
  registerSessionAttendance,
} = require("../services/teacher/teacherAttendanceService");

const router = express.Router();

/**
 * GET /api/teacher/by-user/:userId/classes/:classId/attendance
 * LEGACY — frequência baseada em data, mantida temporariamente
 * durante a migração para frequência por sessão.
 */
router.get(
  "/teacher/by-user/:userId/classes/:classId/attendance",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const result = await getLegacyDateAttendance(db, {
        userId: req.auth.userId,
        classId: req.params.classId,
        date: req.query.date,
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error("Erro ao buscar frequência da turma:", error);

      if (error.statusCode) {
        return res.status(error.statusCode).json({ message: error.message });
      }

      return res.status(500).json({
        message: "Erro interno ao buscar a frequência da turma.",
        error: error.sqlMessage || error.message,
        code: error.code || null,
      });
    }
  }
);

/**
 * GET /api/teacher/by-user/:userId/classes/:classId/sessions/:sessionId/attendance
 */
router.get(
  "/teacher/by-user/:userId/classes/:classId/sessions/:sessionId/attendance",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const result = await getSessionAttendance(db, {
        userId: req.auth.userId,
        classId: req.params.classId,
        sessionId: req.params.sessionId,
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error("Erro ao carregar frequência:", error);

      return res.status(error.statusCode || 500).json({
        message: error.statusCode
          ? error.message
          : "Não foi possível carregar a frequência deste encontro.",
      });
    }
  }
);

/**
 * POST /api/teacher/by-user/:userId/classes/:classId/sessions/:sessionId/attendance
 */
router.post(
  "/teacher/by-user/:userId/classes/:classId/sessions/:sessionId/attendance",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const result = await registerSessionAttendance(db, {
        userId: req.auth.userId,
        classId: req.params.classId,
        sessionId: req.params.sessionId,
        records: req.body.records,
      });

      return res.status(200).json({
        message: "Frequência salva com sucesso.",
        ...result,
      });
    } catch (error) {
      console.error("Erro ao registrar frequência:", error);

      return res.status(error.statusCode || 500).json({
        message: error.statusCode
          ? error.message
          : error.sqlMessage ||
            error.message ||
            "Não foi possível salvar a frequência deste encontro.",
        code: error.code,
        ...(error.extra || {}),
      });
    }
  }
);

module.exports = router;
