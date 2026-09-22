const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  listClasses,
  getClassById,
  getClassImpactById,
  createClass,
  updateClass,
  updateClassStatus,
  deleteClass,
} = require("../services/admin/adminClassService");

const router = express.Router();

function handleServiceError(res, error, fallbackMessage) {
  console.error(fallbackMessage, error);

  if (error.statusCode) {
    return res
      .status(error.statusCode)
      .json({ message: error.message, ...(error.extra || {}) });
  }

  return res.status(500).json({
    message: fallbackMessage,
    error: error.message,
    code: error.code,
    sqlMessage: error.sqlMessage,
  });
}

/**
 * GET /api/admin/classes
 */
router.get(
  "/admin/classes",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await listClasses(db, req.query);

      return res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao buscar turmas.");
    }
  }
);

/**
 * GET /api/admin/classes/:classId
 */
router.get(
  "/admin/classes/:classId",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const classItem = await getClassById(db, req.params.classId);

      return res.status(200).json(classItem);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao buscar turma.");
    }
  }
);

/**
 * GET /api/admin/classes/:classId/impact
 * Prévia de impacto para exibir antes de excluir/arquivar.
 */
router.get(
  "/admin/classes/:classId/impact",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const impact = await getClassImpactById(db, req.params.classId);

      return res.status(200).json(impact);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao calcular impacto da turma.");
    }
  }
);

/**
 * POST /api/admin/classes
 */
router.post(
  "/admin/classes",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const classItem = await createClass(db, req.body);

      return res.status(201).json({
        message: "Turma cadastrada com sucesso.",
        class: classItem,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao cadastrar turma.");
    }
  }
);

/**
 * PUT /api/admin/classes/:classId
 */
router.put(
  "/admin/classes/:classId",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const classItem = await updateClass(db, req.params.classId, req.body);

      return res.status(200).json({
        message: "Turma atualizada com sucesso.",
        class: classItem,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao atualizar turma.");
    }
  }
);

/**
 * PATCH /api/admin/classes/:classId/status
 */
router.patch(
  "/admin/classes/:classId/status",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const classItem = await updateClassStatus(
        db,
        req.params.classId,
        req.body.status
      );

      return res.status(200).json({
        message: "Status da turma atualizado com sucesso.",
        class: classItem,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao atualizar status da turma.");
    }
  }
);

/**
 * DELETE /api/admin/classes/:classId
 * Só remove fisicamente quando não há nenhum vínculo (matrículas,
 * atividades, conteúdos, sessões, frequência) — caso contrário 409
 * com o relatório de impacto.
 */
router.delete(
  "/admin/classes/:classId",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await deleteClass(db, req.params.classId);

      return res.status(200).json({
        message: "Turma removida com sucesso.",
        ...result,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao remover turma.");
    }
  }
);

module.exports = router;
