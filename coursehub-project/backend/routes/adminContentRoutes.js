const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  listMaterials,
  getMaterialById,
  getScopeImpactPreview,
  getMaterialImpactById,
  createMaterial,
  updateMaterial,
  updateMaterialStatus,
  deleteMaterial,
} = require("../services/admin/adminContentService");

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
 * GET /api/admin/materials
 */
router.get(
  "/admin/materials",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await listMaterials(db, req.query);

      return res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao buscar materiais.");
    }
  }
);

/**
 * GET /api/admin/materials/:contentId
 */
router.get(
  "/admin/materials/:contentId",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const material = await getMaterialById(db, req.params.contentId);

      return res.status(200).json(material);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao buscar material.");
    }
  }
);

/**
 * GET /api/admin/materials/:contentId/scope-impact?newClassId=
 * Prévia de impacto antes de mudar geral<->turma.
 */
router.get(
  "/admin/materials/:contentId/scope-impact",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const impact = await getScopeImpactPreview(
        db,
        req.params.contentId,
        req.query.newClassId
      );

      return res.status(200).json(impact);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao calcular impacto de escopo.");
    }
  }
);

/**
 * GET /api/admin/materials/:contentId/impact
 * Prévia de impacto antes de excluir.
 */
router.get(
  "/admin/materials/:contentId/impact",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const impact = await getMaterialImpactById(db, req.params.contentId);

      return res.status(200).json(impact);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao calcular impacto do material.");
    }
  }
);

/**
 * POST /api/admin/materials
 */
router.post(
  "/admin/materials",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const material = await createMaterial(db, req.body, { userId: req.auth.userId });

      return res.status(201).json({
        message: "Material cadastrado com sucesso.",
        material,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao cadastrar material.");
    }
  }
);

/**
 * PUT /api/admin/materials/:contentId
 */
router.put(
  "/admin/materials/:contentId",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await updateMaterial(db, req.params.contentId, req.body, {
        userId: req.auth.userId,
      });

      return res.status(200).json({
        message: "Material atualizado com sucesso.",
        ...result,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao atualizar material.");
    }
  }
);

/**
 * PATCH /api/admin/materials/:contentId/status
 */
router.patch(
  "/admin/materials/:contentId/status",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const material = await updateMaterialStatus(
        db,
        req.params.contentId,
        req.body.status
      );

      return res.status(200).json({
        message: "Status do material atualizado com sucesso.",
        material,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao atualizar status do material.");
    }
  }
);

/**
 * DELETE /api/admin/materials/:contentId
 * Só remove fisicamente quando não há progresso registrado —
 * senão 409 com o impacto.
 */
router.delete(
  "/admin/materials/:contentId",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await deleteMaterial(db, req.params.contentId);

      return res.status(200).json({
        message: "Material removido com sucesso.",
        ...result,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao remover material.");
    }
  }
);

module.exports = router;
