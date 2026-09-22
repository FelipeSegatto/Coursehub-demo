const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const { clearAuthCookies } = require("../utils/cookies");

const {
  getFullProfile,
  updateProfile,
  updatePassword,
  updateAvatar,
} = require("../services/profile/profileService");
const { createUploadedFile } = require("../services/files/uploadedFileService");
const { uploadForPurpose } = require("../middlewares/uploadMiddleware");

const router = express.Router();

/**
 * GET /api/profile/me
 */
router.get("/profile/me", authenticateToken, async (req, res) => {
  try {
    const profile = await getFullProfile(db, req.auth.userId);

    if (!profile) {
      return res.status(404).json({ message: "Usuário não encontrado." });
    }

    if (profile.status !== "active") {
      return res.status(403).json({ message: "Conta inativa ou bloqueada." });
    }

    return res.status(200).json({ profile });
  } catch (error) {
    console.error("Erro ao carregar perfil:", error);

    return res.status(500).json({ message: "Erro ao carregar perfil." });
  }
});

/**
 * PATCH /api/profile/me
 */
router.patch("/profile/me", authenticateToken, async (req, res) => {
  try {
    const profile = await updateProfile(db, {
      userId: req.auth.userId,
      role: req.auth.role,
      payload: req.body,
    });

    return res.status(200).json({
      message: "Perfil atualizado com sucesso.",
      profile,
    });
  } catch (error) {
    console.error("Erro ao atualizar perfil:", error);

    return res.status(error.statusCode || 500).json({
      message: error.statusCode
        ? error.message
        : "Erro ao atualizar perfil.",
    });
  }
});

/**
 * PATCH /api/profile/me/password
 *
 * Ao trocar a senha, revoga todos os refresh tokens do usuário —
 * qualquer outra sessão aberta (outro navegador, outro dispositivo)
 * precisa fazer login de novo.
 */
router.patch(
  "/profile/me/password",
  authenticateToken,
  async (req, res) => {
    try {
      await updatePassword(db, {
        userId: req.auth.userId,
        currentPassword: req.body.currentPassword,
        newPassword: req.body.newPassword,
      });

      clearAuthCookies(res);

      return res.status(200).json({
        message: "Senha alterada com sucesso. Faça login novamente.",
      });
    } catch (error) {
      console.error("Erro ao atualizar senha:", error);

      return res.status(error.statusCode || 500).json({
        message: error.statusCode
          ? error.message
          : "Erro ao atualizar senha.",
      });
    }
  }
);

/**
 * PATCH /api/profile/me/avatar
 * Troca o avatar de catálogo (avatarKey) ou aponta para um upload
 * já criado (avatarFileId).
 */
router.patch("/profile/me/avatar", authenticateToken, async (req, res) => {
  try {
    const profile = await updateAvatar(db, {
      userId: req.auth.userId,
      avatarKey: req.body.avatarKey,
      avatarFileId: req.body.avatarFileId,
    });

    return res.status(200).json({
      message: "Avatar atualizado com sucesso.",
      profile,
    });
  } catch (error) {
    console.error("Erro ao atualizar avatar:", error);

    return res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Erro ao atualizar avatar.",
    });
  }
});

/**
 * POST /api/profile/me/avatar
 * Envia uma foto de perfil e já a associa à conta.
 */
router.post(
  "/profile/me/avatar",
  authenticateToken,
  uploadForPurpose("purpose", { forcePurpose: "avatar" }),
  async (req, res) => {
    try {
      const file = await createUploadedFile(db, {
        ownerUserId: req.auth.userId,
        purpose: "avatar",
        file: req.file,
      });

      const profile = await updateAvatar(db, {
        userId: req.auth.userId,
        avatarFileId: file.id,
      });

      return res.status(200).json({
        message: "Foto de perfil enviada com sucesso.",
        file,
        profile,
      });
    } catch (error) {
      console.error("Erro ao enviar foto de perfil:", error);

      return res.status(error.statusCode || 500).json({
        message: error.statusCode ? error.message : "Erro ao enviar foto de perfil.",
      });
    }
  }
);

module.exports = router;
