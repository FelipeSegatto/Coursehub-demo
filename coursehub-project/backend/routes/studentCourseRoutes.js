const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  listEnrolledCourses,
} = require("../services/students/studentCourseService");

const router = express.Router();

/**
 * GET /api/students/me/courses
 * Lista os cursos em que o aluno possui matrícula ativa.
 */
router.get(
  "/students/me/courses",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const courses = await listEnrolledCourses(db, req.auth.userId);

      return res.status(200).json(courses);
    } catch (error) {
      console.error("Erro ao buscar cursos matriculados:", error);

      return res.status(error.statusCode || 500).json({
        message: error.statusCode
          ? error.message
          : "Erro interno ao buscar cursos matriculados.",
      });
    }
  }
);

module.exports = router;
