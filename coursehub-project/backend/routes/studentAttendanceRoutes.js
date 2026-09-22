const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const { getStudentAttendance } = require("../services/students/studentAttendanceService");

const router = express.Router();

router.get(
  "/students/me/attendance",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const attendance = await getStudentAttendance(db, req.auth.userId);

      return res.status(200).json(attendance);
    } catch (error) {
      console.error("Erro ao buscar frequência do aluno:", error);

      return res.status(error.statusCode || 500).json({
        message: error.statusCode
          ? error.message
          : "Erro ao buscar a frequência do aluno.",
      });
    }
  }
);

module.exports = router;