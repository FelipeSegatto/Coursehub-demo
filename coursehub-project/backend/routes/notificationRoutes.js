const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");

const {
  listInbox,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  archiveNotification,
} = require("../services/notifications/notificationQueryService");

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
 * GET /api/notifications
 * Personal inbox. userId always comes from the token -- never a
 * query/body param.
 */
router.get("/notifications", authenticateToken, async (req, res) => {
  try {
    const result = await listInbox(db, {
      userId: req.auth.userId,
      cursor: req.query.cursor,
      limit: req.query.limit,
      status: req.query.status,
      category: req.query.category,
      includeArchived: req.query.includeArchived === "true",
    });

    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error, "Erro ao buscar notificações.");
  }
});

/**
 * GET /api/notifications/unread-count
 */
router.get("/notifications/unread-count", authenticateToken, async (req, res) => {
  try {
    const result = await getUnreadCount(db, { userId: req.auth.userId });

    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error, "Erro ao buscar contador de notificações.");
  }
});

/**
 * PATCH /api/notifications/read-all
 */
router.patch("/notifications/read-all", authenticateToken, async (req, res) => {
  try {
    const result = await markAllAsRead(db, { userId: req.auth.userId });

    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error, "Erro ao marcar notificações como lidas.");
  }
});

/**
 * PATCH /api/notifications/:notificationId/read
 */
router.patch("/notifications/:notificationId/read", authenticateToken, async (req, res) => {
  try {
    const result = await markAsRead(db, {
      userId: req.auth.userId,
      notificationId: req.params.notificationId,
    });

    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error, "Erro ao marcar notificação como lida.");
  }
});

/**
 * PATCH /api/notifications/:notificationId/archive
 */
router.patch("/notifications/:notificationId/archive", authenticateToken, async (req, res) => {
  try {
    const result = await archiveNotification(db, {
      userId: req.auth.userId,
      notificationId: req.params.notificationId,
    });

    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error, "Erro ao arquivar notificação.");
  }
});

module.exports = router;
