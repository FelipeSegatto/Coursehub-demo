const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const { uploadForPurpose } = require("../middlewares/uploadMiddleware");
const {
  createUploadedFile,
  readAuthorizedFile,
} = require("../services/files/uploadedFileService");

const router = express.Router();

/**
 * POST /api/uploads
 * multipart/form-data: file + purpose (avatar|submission|course_material)
 */
router.post("/uploads", authenticateToken, uploadForPurpose("purpose"), async (req, res) => {
  try {
    const file = await createUploadedFile(db, {
      ownerUserId: req.auth.userId,
      purpose: req.uploadPurpose,
      file: req.file,
    });

    return res.status(201).json({ file });
  } catch (error) {
    console.error("Erro ao enviar arquivo:", error);

    return res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Erro ao enviar arquivo.",
    });
  }
});

/**
 * GET /api/files/:fileId
 * Stream autenticado. Avatares: qualquer usuário logado.
 * Envios: dono ou professor do curso. Materiais: aluno matriculado,
 * professor do curso ou admin.
 */
router.get("/files/:fileId", authenticateToken, async (req, res) => {
  try {
    const { buffer, mimeType, originalName, inline } = await readAuthorizedFile(db, {
      fileId: req.params.fileId,
      auth: req.auth,
    });

    res.setHeader("Content-Type", mimeType);
    res.setHeader(
      "Content-Disposition",
      `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(originalName)}"`
    );
    res.setHeader("Cache-Control", "private, max-age=3600");

    return res.status(200).send(buffer);
  } catch (error) {
    console.error("Erro ao baixar arquivo:", error);

    return res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Erro ao baixar arquivo.",
    });
  }
});

module.exports = router;
