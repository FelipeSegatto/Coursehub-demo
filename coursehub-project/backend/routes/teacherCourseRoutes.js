const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  listTeacherCourses,
  listTeacherStudents,
} = require("../services/teacher/teacherCourseService");

const router = express.Router();

/**
 * GET /api/teacher/by-user/:userId/courses
 * Identidade sempre vem do token — nunca da URL.
 */
router.get(
  "/teacher/by-user/:userId/courses",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const courses = await listTeacherCourses(db, req.auth.userId);

      return res.status(200).json(courses);
    } catch (error) {
      console.error("Erro ao buscar cursos do professor:", error);

      return res.status(500).json({
        message: "Erro ao buscar cursos do professor.",
      });
    }
  }
);

/**
 * GET /api/teacher/by-user/:userId/students
 * Identidade sempre vem do token — nunca da URL.
 */
router.get(
  "/teacher/by-user/:userId/students",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const students = await listTeacherStudents(db, req.auth.userId);

      return res.status(200).json(students);
    } catch (error) {
      console.error("Erro ao buscar alunos do professor:", error);

      return res.status(500).json({
        message: "Erro ao buscar alunos do professor.",
      });
    }
  }
);

module.exports = router;
