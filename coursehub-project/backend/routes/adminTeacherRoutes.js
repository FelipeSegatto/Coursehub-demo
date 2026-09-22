const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  listTeachers,
  createTeacher,
  updateTeacher,
  deleteTeacher,
} = require("../services/admin/adminTeacherService");

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
 * GET /api/admin/teachers
 */
router.get(
  "/admin/teachers",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const teachers = await listTeachers(db);

      return res.status(200).json(teachers);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao buscar professores.");
    }
  }
);

/**
 * POST /api/admin/teachers
 */
router.post(
  "/admin/teachers",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const teacher = await createTeacher(db, req.body, { actorUserId: req.auth.userId });

      return res.status(201).json({
        message: "Professor cadastrado com sucesso.",
        teacher,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao cadastrar professor.");
    }
  }
);

/**
 * PUT /api/admin/teachers/:id
 */
router.put(
  "/admin/teachers/:id",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const teacher = await updateTeacher(db, req.params.id, req.body);

      return res.status(200).json({
        message: "Professor atualizado com sucesso.",
        teacher,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao atualizar professor.");
    }
  }
);

/**
 * DELETE /api/admin/teachers/:id
 * Soft delete — desativa o professor sem removê-lo do banco.
 */
router.delete(
  "/admin/teachers/:id",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const teacher = await deleteTeacher(db, req.params.id);

      return res.status(200).json({
        message: "Professor removido com sucesso.",
        teacher,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao remover professor.");
    }
  }
);

module.exports = router;
