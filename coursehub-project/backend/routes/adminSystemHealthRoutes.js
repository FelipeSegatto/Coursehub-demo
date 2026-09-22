const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const { getSystemHealth } = require("../services/admin/systemHealthService");

const router = express.Router();

/**
 * GET /api/admin/system-health
 * Read-only operational snapshot: notification/email outbox backlog,
 * scheduled-reminders backlog, chat queue depth. See
 * systemHealthService.js's own docstring for why this exists --
 * every worker it reports on runs as a separate process nothing else
 * in this API automatically restarts or alerts on.
 */
router.get("/admin/system-health", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const result = await getSystemHealth(db);

    return res.status(200).json(result);
  } catch (error) {
    console.error("Erro ao buscar saúde do sistema:", error);

    return res.status(500).json({
      message: "Erro ao buscar saúde do sistema.",
      error: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage,
    });
  }
});

module.exports = router;
