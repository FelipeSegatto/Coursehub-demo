const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  getTeacherDashboard,
} = require("../services/dashboard/teacherDashboardService");

const router = express.Router();

/**
 * GET /api/teacher/dashboard
 */
router.get(
  "/teacher/dashboard",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const dashboard = await getTeacherDashboard(db, req.auth.userId);

      return res.status(200).json(dashboard);
    } catch (error) {
      console.error("Erro ao buscar dashboard do professor:", error);

      return res.status(error.statusCode || 500).json({
        message: error.message || "Erro ao buscar dashboard do professor.",
        error: error.message,
        code: error.code,
        sqlMessage: error.sqlMessage,
      });
    }
  }
);

module.exports = router;
