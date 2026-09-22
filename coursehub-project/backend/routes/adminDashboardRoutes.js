const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  getAdminDashboard,
} = require("../services/dashboard/adminDashboardService");

const router = express.Router();

/**
 * GET /api/admin/dashboard
 */
router.get(
  "/admin/dashboard",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const dashboard = await getAdminDashboard(db, req.auth.userId);

      return res.status(200).json(dashboard);
    } catch (error) {
      console.error("Erro ao buscar dashboard administrativo:", error);

      return res.status(error.statusCode || 500).json({
        message: error.message || "Erro ao buscar dashboard administrativo.",
        error: error.message,
        code: error.code,
        sqlMessage: error.sqlMessage,
      });
    }
  }
);

module.exports = router;
