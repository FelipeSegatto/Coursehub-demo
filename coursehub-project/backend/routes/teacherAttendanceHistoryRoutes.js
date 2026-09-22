const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  getTeacherAttendanceHistory,
} = require("../services/attendance/teacherAttendanceHistoryService");

const router = express.Router();

/**
 * GET /api/teacher/attendance/history
 */
router.get(
  "/teacher/attendance/history",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const result = await getTeacherAttendanceHistory(db, {
        userId: req.auth.userId,
        classId: req.query.classId,
        from: req.query.from,
        to: req.query.to,
        sessionStatus: req.query.sessionStatus,
        attendanceStatus: req.query.attendanceStatus,
        page: req.query.page,
        limit: req.query.limit,
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error("Erro ao buscar histórico de frequência:", error);

      return res.status(error.statusCode || 500).json({
        message: error.message || "Erro ao buscar histórico de frequência.",
      });
    }
  }
);

module.exports = router;
