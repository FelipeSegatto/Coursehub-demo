const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  getTeacherClassActivityGrades,
} = require("../services/activities/teacherGradeService");

const router = express.Router();

/**
 * GET /api/teacher/grades
 */
router.get(
  "/teacher/grades",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const result = await getTeacherClassActivityGrades(db, {
        userId: req.auth.userId,
        classId: req.query.classId,
        activityId: req.query.activityId,
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error("Erro ao buscar notas da turma:", error);

      return res.status(error.statusCode || 500).json({
        message: error.message || "Erro ao buscar notas da turma.",
      });
    }
  }
);

module.exports = router;
