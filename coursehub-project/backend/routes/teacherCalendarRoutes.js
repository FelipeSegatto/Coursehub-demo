const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const { getTeacherCalendar } = require("../services/calendar/teacherCalendarService");

const router = express.Router();

/**
 * GET /api/teacher/by-user/:userId/calendar
 * :userId só por compatibilidade de padrão de URL — identidade real
 * sempre vem de req.auth.userId.
 */
router.get(
  "/teacher/by-user/:userId/calendar",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const result = await getTeacherCalendar(db, {
        userId: req.auth.userId,
        from: req.query.from,
        to: req.query.to,
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error("Erro ao buscar calendário do professor:", error);

      return res.status(error.statusCode || 500).json({
        message: error.message || "Erro ao buscar calendário.",
      });
    }
  }
);

module.exports = router;
