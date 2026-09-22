const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  listSessions,
  getSession,
  createSession,
  updateSession,
  cancelSession,
} = require("../services/teacher/teacherSessionService");

const router = express.Router();

function handleServiceError(res, error, fallbackMessage) {
  console.error(fallbackMessage, error);

  if (error.statusCode) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  return res.status(500).json({
    message: fallbackMessage,
    error: error.sqlMessage || error.message,
    code: error.code || null,
  });
}

/**
 * GET /api/teacher/by-user/:userId/classes/:classId/sessions
 */
router.get(
  "/teacher/by-user/:userId/classes/:classId/sessions",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const result = await listSessions(db, {
        userId: req.auth.userId,
        classId: Number(req.params.classId),
        status: req.query.status,
        sessionType: req.query.sessionType,
      });

      return res.status(200).json(result);
    } catch (error) {
      return handleServiceError(
        res,
        error,
        "Erro interno ao buscar as sessões da turma."
      );
    }
  }
);

/**
 * GET /api/teacher/by-user/:userId/class-sessions/:sessionId
 */
router.get(
  "/teacher/by-user/:userId/class-sessions/:sessionId",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const result = await getSession(
        db,
        req.auth.userId,
        Number(req.params.sessionId)
      );

      return res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro interno ao buscar a sessão.");
    }
  }
);

/**
 * POST /api/teacher/by-user/:userId/classes/:classId/sessions
 */
router.post(
  "/teacher/by-user/:userId/classes/:classId/sessions",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const result = await createSession(db, {
        userId: req.auth.userId,
        classId: Number(req.params.classId),
        payload: req.body,
      });

      return res.status(201).json({
        message: "Sessão criada com sucesso.",
        ...result,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro interno ao criar a sessão.");
    }
  }
);

/**
 * PUT /api/teacher/by-user/:userId/class-sessions/:sessionId
 */
router.put(
  "/teacher/by-user/:userId/class-sessions/:sessionId",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const result = await updateSession(db, {
        userId: req.auth.userId,
        sessionId: Number(req.params.sessionId),
        payload: req.body,
      });

      return res.status(200).json({
        message: "Sessão atualizada com sucesso.",
        ...result,
      });
    } catch (error) {
      return handleServiceError(
        res,
        error,
        "Erro interno ao atualizar a sessão."
      );
    }
  }
);

/**
 * DELETE /api/teacher/by-user/:userId/class-sessions/:sessionId
 * Soft delete — apenas marca a sessão como cancelada.
 */
router.delete(
  "/teacher/by-user/:userId/class-sessions/:sessionId",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const result = await cancelSession(db, {
        userId: req.auth.userId,
        sessionId: Number(req.params.sessionId),
      });

      return res.status(200).json({
        message: result.alreadyCancelled
          ? "A sessão já estava cancelada."
          : "Sessão cancelada com sucesso.",
        session: result.session,
      });
    } catch (error) {
      return handleServiceError(
        res,
        error,
        "Erro interno ao cancelar a sessão."
      );
    }
  }
);

module.exports = router;
