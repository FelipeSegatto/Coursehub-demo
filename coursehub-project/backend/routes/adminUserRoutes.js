const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");
const { accountActivationInvitationRateLimiter } = require("../middlewares/rateLimiters");

const {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  updateUserStatus,
  softDeleteUser,
  sendPasswordReset,
} = require("../services/admin/adminUserService");

const {
  createAccountActivationInvitation,
  resendActivationEmail,
} = require("../services/auth/accountActivationService");

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
 * GET /api/admin/users
 */
router.get(
  "/admin/users",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await listUsers(db, req.query);

      return res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao buscar usuários.");
    }
  }
);

/**
 * GET /api/admin/users/:userId
 */
router.get(
  "/admin/users/:userId",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const user = await getUserById(db, req.params.userId);

      return res.status(200).json(user);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao buscar usuário.");
    }
  }
);

/**
 * POST /api/admin/users
 * Cria um usuário do papel solicitado (admin, teacher ou student) --
 * o service decide o fluxo transacional correto para cada um. Alunos
 * e professores também continuam disponíveis via /api/admin/students
 * e /api/admin/teachers (mesmo service por baixo, sem duplicação).
 */
router.post(
  "/admin/users",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const user = await createUser(db, req.body, { actorUserId: req.auth.userId });

      return res.status(201).json({
        message: "Usuário cadastrado com sucesso.",
        user,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao cadastrar usuário.");
    }
  }
);

/**
 * PUT /api/admin/users/:userId
 */
router.put(
  "/admin/users/:userId",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const { name, email, gender } = req.body;
      const user = await updateUser(db, req.params.userId, { name, email, gender });

      return res.status(200).json({
        message: "Usuário atualizado com sucesso.",
        user,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao atualizar usuário.");
    }
  }
);

/**
 * PATCH /api/admin/users/:userId/status
 */
router.patch(
  "/admin/users/:userId/status",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const user = await updateUserStatus(
        db,
        req.params.userId,
        req.body.status,
        req.auth.userId
      );

      return res.status(200).json({
        message: "Status do usuário atualizado com sucesso.",
        user,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao atualizar status do usuário.");
    }
  }
);

/**
 * POST /api/admin/users/:userId/send-password-reset
 */
router.post(
  "/admin/users/:userId/send-password-reset",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await sendPasswordReset(db, req.params.userId);

      return res.status(200).json(result);
    } catch (error) {
      return handleServiceError(
        res,
        error,
        "Erro ao enviar recuperação de senha."
      );
    }
  }
);

/**
 * POST /api/admin/users/:userId/resend-activation
 * Alias simples (deliveryMethod fixo em 'email') do endpoint
 * unificado abaixo -- mantido porque foi sugerido separadamente, mas
 * nunca duplica a lógica.
 */
router.post(
  "/admin/users/:userId/resend-activation",
  authenticateToken,
  authorizeRoles("admin"),
  accountActivationInvitationRateLimiter,
  async (req, res) => {
    try {
      const result = await resendActivationEmail(db, {
        userId: req.params.userId,
        actorUserId: req.auth.userId,
      });

      return res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao reenviar convite de ativação.");
    }
  }
);

/**
 * POST /api/admin/users/:userId/account-activation-invitations
 * Endpoint único do adendo: { deliveryMethod: "email" | "manual_link" }.
 * O link bruto (manual_link) só existe nesta resposta -- nunca é
 * logado, persistido em texto puro, ou recuperável depois.
 * Cache-Control/Pragma evitam que a resposta fique em cache de
 * proxy/navegador com o link dentro.
 */
router.post(
  "/admin/users/:userId/account-activation-invitations",
  authenticateToken,
  authorizeRoles("admin"),
  accountActivationInvitationRateLimiter,
  async (req, res) => {
    try {
      const result = await createAccountActivationInvitation(db, {
        userId: req.params.userId,
        deliveryMethod: req.body?.deliveryMethod,
        actorUserId: req.auth.userId,
      });

      res.set("Cache-Control", "no-store");
      res.set("Pragma", "no-cache");

      return res.status(201).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao gerar convite de ativação.");
    }
  }
);

/**
 * DELETE /api/admin/users/:userId
 * Soft delete — nunca remove fisicamente (cascatearia para a
 * entidade acadêmica/profissional inteira). Alias de inativação.
 */
router.delete(
  "/admin/users/:userId",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const user = await softDeleteUser(db, req.params.userId, req.auth.userId);

      return res.status(200).json({
        message: "Usuário inativado com sucesso.",
        user,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao remover usuário.");
    }
  }
);

module.exports = router;
