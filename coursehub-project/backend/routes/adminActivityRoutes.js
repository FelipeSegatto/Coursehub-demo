const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  listActivities,
  getActivityById,
  getActivityImpactById,
  createActivity,
  updateActivity,
  updateActivityStatus,
  deleteActivity,
} = require("../services/admin/adminActivityService");

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
 * Monta um conjunto completo de rotas REST para um activity_kind
 * fixo ("activity" ou "exam") sob o prefixo informado. O kind
 * nunca vem do cliente — é sempre o valor fechado aqui, então não
 * há como manipular a rota de atividades para acessar avaliações
 * (e vice-versa): o WHERE activity_kind = ? do service já isola.
 */
function mountKindRoutes(prefix, activityKind, labels) {
  /**
   * GET /api/admin/{prefix}
   */
  router.get(
    `/admin/${prefix}`,
    authenticateToken,
    authorizeRoles("admin"),
    async (req, res) => {
      try {
        const result = await listActivities(db, activityKind, req.query);

        return res.status(200).json(result);
      } catch (error) {
        return handleServiceError(res, error, `Erro ao buscar ${labels.plural}.`);
      }
    }
  );

  /**
   * GET /api/admin/{prefix}/:activityId
   */
  router.get(
    `/admin/${prefix}/:activityId`,
    authenticateToken,
    authorizeRoles("admin"),
    async (req, res) => {
      try {
        const activity = await getActivityById(db, activityKind, req.params.activityId);

        return res.status(200).json(activity);
      } catch (error) {
        return handleServiceError(res, error, `Erro ao buscar ${labels.singular}.`);
      }
    }
  );

  /**
   * GET /api/admin/{prefix}/:activityId/impact
   */
  router.get(
    `/admin/${prefix}/:activityId/impact`,
    authenticateToken,
    authorizeRoles("admin"),
    async (req, res) => {
      try {
        const impact = await getActivityImpactById(
          db,
          activityKind,
          req.params.activityId
        );

        return res.status(200).json(impact);
      } catch (error) {
        return handleServiceError(
          res,
          error,
          `Erro ao calcular impacto de ${labels.singular}.`
        );
      }
    }
  );

  /**
   * POST /api/admin/{prefix}
   */
  router.post(
    `/admin/${prefix}`,
    authenticateToken,
    authorizeRoles("admin"),
    async (req, res) => {
      try {
        const activity = await createActivity(db, activityKind, req.body);

        return res.status(201).json({
          message: `${labels.createdMessage}`,
          activity,
        });
      } catch (error) {
        return handleServiceError(res, error, `Erro ao cadastrar ${labels.singular}.`);
      }
    }
  );

  /**
   * PUT /api/admin/{prefix}/:activityId
   */
  router.put(
    `/admin/${prefix}/:activityId`,
    authenticateToken,
    authorizeRoles("admin"),
    async (req, res) => {
      try {
        const activity = await updateActivity(
          db,
          activityKind,
          req.params.activityId,
          req.body
        );

        return res.status(200).json({
          message: `${labels.updatedMessage}`,
          activity,
        });
      } catch (error) {
        return handleServiceError(res, error, `Erro ao atualizar ${labels.singular}.`);
      }
    }
  );

  /**
   * PATCH /api/admin/{prefix}/:activityId/status
   */
  router.patch(
    `/admin/${prefix}/:activityId/status`,
    authenticateToken,
    authorizeRoles("admin"),
    async (req, res) => {
      try {
        const activity = await updateActivityStatus(
          db,
          activityKind,
          req.params.activityId,
          req.body.status
        );

        return res.status(200).json({
          message: `Status de ${labels.singular} atualizado com sucesso.`,
          activity,
        });
      } catch (error) {
        return handleServiceError(
          res,
          error,
          `Erro ao atualizar status de ${labels.singular}.`
        );
      }
    }
  );

  /**
   * DELETE /api/admin/{prefix}/:activityId
   */
  router.delete(
    `/admin/${prefix}/:activityId`,
    authenticateToken,
    authorizeRoles("admin"),
    async (req, res) => {
      try {
        const result = await deleteActivity(db, activityKind, req.params.activityId);

        return res.status(200).json({
          message: `${labels.singularCapitalized} removida com sucesso.`,
          ...result,
        });
      } catch (error) {
        return handleServiceError(res, error, `Erro ao remover ${labels.singular}.`);
      }
    }
  );
}

mountKindRoutes("activities", "activity", {
  singular: "atividade",
  singularCapitalized: "Atividade",
  plural: "atividades",
  createdMessage: "Atividade cadastrada com sucesso.",
  updatedMessage: "Atividade atualizada com sucesso.",
});

mountKindRoutes("assessments", "exam", {
  singular: "avaliação",
  singularCapitalized: "Avaliação",
  plural: "avaliações",
  createdMessage: "Avaliação cadastrada com sucesso.",
  updatedMessage: "Avaliação atualizada com sucesso.",
});

module.exports = router;
