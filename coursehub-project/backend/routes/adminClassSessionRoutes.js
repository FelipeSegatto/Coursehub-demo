const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  listSessionsForAdmin,
  getSessionForAdmin,
  createSessionAsAdmin,
  updateSessionAsAdmin,
  cancelSessionAsAdmin,
} = require("../services/admin/adminClassSessionService");

const router = express.Router();

function handleServiceError(res, error, fallbackMessage) {
  console.error(fallbackMessage, error);

  if (error.statusCode) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  return res.status(500).json({ message: fallbackMessage });
}

/**
 * GET /api/admin/class-sessions?classId=...&status=...&sessionType=...&from=...&to=...
 */
router.get("/admin/class-sessions", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const result = await listSessionsForAdmin(db, req.query);

    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error, "Erro ao buscar encontros.");
  }
});

/**
 * GET /api/admin/class-sessions/:sessionId
 */
router.get("/admin/class-sessions/:sessionId", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const result = await getSessionForAdmin(db, req.params.sessionId);

    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error, "Erro ao buscar encontro.");
  }
});

/**
 * POST /api/admin/classes/:classId/sessions
 */
router.post(
  "/admin/classes/:classId/sessions",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await createSessionAsAdmin(db, {
        actorUserId: req.auth.userId,
        classId: req.params.classId,
        payload: req.body,
      });

      return res.status(201).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao criar encontro.");
    }
  }
);

/**
 * PUT /api/admin/class-sessions/:sessionId
 */
router.put(
  "/admin/class-sessions/:sessionId",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await updateSessionAsAdmin(db, {
        actorUserId: req.auth.userId,
        sessionId: req.params.sessionId,
        payload: req.body,
      });

      return res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao editar encontro.");
    }
  }
);

/**
 * DELETE /api/admin/class-sessions/:sessionId
 * Soft cancel -- nunca remove fisicamente a linha (frequência já
 * lançada continua íntegra).
 */
router.delete(
  "/admin/class-sessions/:sessionId",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await cancelSessionAsAdmin(db, {
        actorUserId: req.auth.userId,
        sessionId: req.params.sessionId,
      });

      return res.status(200).json({
        message: result.alreadyCancelled ? "Este encontro já estava cancelado." : "Encontro cancelado com sucesso.",
        ...result,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao cancelar encontro.");
    }
  }
);

module.exports = router;
