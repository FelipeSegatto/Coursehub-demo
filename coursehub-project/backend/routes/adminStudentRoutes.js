const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  listStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
} = require("../services/admin/adminStudentService");

const router = express.Router();

function handleServiceError(res, error, fallbackMessage) {
  console.error(fallbackMessage, error);

  if (error.statusCode) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  return res.status(500).json({
    message: fallbackMessage,
    error: error.message,
    code: error.code,
    sqlMessage: error.sqlMessage,
  });
}

/**
 * GET /api/admin/students
 */
router.get(
  "/admin/students",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const students = await listStudents(db, {
        courseId: req.query.courseId,
        classId: req.query.classId,
        status: req.query.status,
      });

      return res.status(200).json(students);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao buscar alunos.");
    }
  }
);

/**
 * GET /api/admin/students/:id
 */
router.get(
  "/admin/students/:id",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const student = await getStudentById(db, req.params.id);

      return res.status(200).json(student);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao buscar aluno.");
    }
  }
);

/**
 * POST /api/admin/students
 */
router.post(
  "/admin/students",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const student = await createStudent(db, req.body, { actorUserId: req.auth.userId });

      return res.status(201).json({
        message: "Aluno cadastrado com sucesso.",
        student,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao cadastrar aluno.");
    }
  }
);

/**
 * PUT /api/admin/students/:id
 */
router.put(
  "/admin/students/:id",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const student = await updateStudent(db, req.params.id, req.body);

      return res.status(200).json({
        message: "Aluno atualizado com sucesso.",
        student,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao atualizar aluno.");
    }
  }
);

/**
 * DELETE /api/admin/students/:id
 * Soft delete — desativa o aluno sem removê-lo do banco.
 */
router.delete(
  "/admin/students/:id",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const student = await deleteStudent(db, req.params.id);

      return res.status(200).json({
        message: "Aluno removido com sucesso.",
        student,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao remover aluno.");
    }
  }
);

module.exports = router;
