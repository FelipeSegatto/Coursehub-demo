const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const { getStudentCalendar } = require("../services/calendar/studentCalendarService");

const router = express.Router();

/**
 * GET /api/students/by-user/calendar
 * Identidade sempre vem do token — a URL não usa :userId.
 */
router.get(
  "/students/by-user/calendar",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const result = await getStudentCalendar(db, {
        userId: req.auth.userId,
        from: req.query.from,
        to: req.query.to,
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error("Erro ao buscar calendário do aluno:", error);

      return res.status(error.statusCode || 500).json({
        message: error.message || "Erro ao buscar calendário.",
      });
    }
  }
);

module.exports = router;
