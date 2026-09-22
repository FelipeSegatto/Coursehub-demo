const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");

const {
  listPreferences,
  updatePreference,
} = require("../services/notifications/notificationPreferenceService");

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
 * GET /api/notification-preferences
 */
router.get("/notification-preferences", authenticateToken, async (req, res) => {
  try {
    const result = await listPreferences(db, { userId: req.auth.userId });

    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error, "Erro ao buscar preferências de notificação.");
  }
});

/**
 * PATCH /api/notification-preferences/:category
 */
router.patch("/notification-preferences/:category", authenticateToken, async (req, res) => {
  try {
    const result = await updatePreference(db, {
      userId: req.auth.userId,
      category: req.params.category,
      emailEnabled: req.body.emailEnabled,
    });

    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error, "Erro ao atualizar preferência de notificação.");
  }
});

module.exports = router;
