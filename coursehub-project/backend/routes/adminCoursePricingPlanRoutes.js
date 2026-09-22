const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  listPricingPlans,
  getPricingPlanById,
  createPricingPlan,
  updatePricingPlan,
  updatePricingPlanStatus,
  deletePricingPlan,
} = require("../services/courses/coursePricingPlanService");

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
 * GET /api/admin/course-pricing-plans
 */
router.get(
  "/admin/course-pricing-plans",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await listPricingPlans(db, req.query);

      return res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao listar planos comerciais.");
    }
  }
);

/**
 * GET /api/admin/course-pricing-plans/:planId
 */
router.get(
  "/admin/course-pricing-plans/:planId",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const plan = await getPricingPlanById(db, req.params.planId);

      return res.status(200).json({ data: plan });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao buscar plano comercial.");
    }
  }
);

/**
 * POST /api/admin/course-pricing-plans
 */
router.post(
  "/admin/course-pricing-plans",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const plan = await createPricingPlan(db, req.body);

      return res.status(201).json({
        message: "Plano comercial criado com sucesso.",
        data: plan,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao criar plano comercial.");
    }
  }
);

/**
 * PUT /api/admin/course-pricing-plans/:planId
 */
router.put(
  "/admin/course-pricing-plans/:planId",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const plan = await updatePricingPlan(db, req.params.planId, req.body);

      return res.status(200).json({
        message: "Plano comercial atualizado com sucesso.",
        data: plan,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao atualizar plano comercial.");
    }
  }
);

/**
 * PATCH /api/admin/course-pricing-plans/:planId/status
 */
router.patch(
  "/admin/course-pricing-plans/:planId/status",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const plan = await updatePricingPlanStatus(db, req.params.planId, req.body.status);

      return res.status(200).json({
        message: "Status do plano comercial atualizado com sucesso.",
        data: plan,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao atualizar status do plano comercial.");
    }
  }
);

/**
 * DELETE /api/admin/course-pricing-plans/:planId
 * Soft delete — alias de inativação (financial_contracts referencia
 * pricing_plan_id; um plano nunca pode ser removido fisicamente).
 */
router.delete(
  "/admin/course-pricing-plans/:planId",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const plan = await deletePricingPlan(db, req.params.planId);

      return res.status(200).json({
        message: "Plano comercial inativado com sucesso.",
        data: plan,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao remover plano comercial.");
    }
  }
);

module.exports = router;
