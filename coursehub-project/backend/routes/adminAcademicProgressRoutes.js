const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const { listAcademicProgress } = require("../services/admin/adminAcademicProgressService");

const router = express.Router();

function handleServiceError(res, error, fallbackMessage) {
  console.error(fallbackMessage, error);

  if (error.statusCode) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  return res.status(500).json({ message: fallbackMessage });
}

/**
 * GET /api/admin/academic-progress
 */
router.get("/admin/academic-progress", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const result = await listAcademicProgress(db, req.query);

    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error, "Erro ao buscar progresso acadêmico.");
  }
});

module.exports = router;
