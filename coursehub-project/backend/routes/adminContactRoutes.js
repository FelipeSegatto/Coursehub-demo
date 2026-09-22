const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  listContactRequests,
  getContactRequestById,
  updateContactRequestStatus,
} = require("../services/admin/adminContactService");

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

router.get("/admin/contacts", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const result = await listContactRequests(db, req.query);

    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error, "Erro ao listar contatos.");
  }
});

router.get("/admin/contacts/:contactId", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const contact = await getContactRequestById(db, req.params.contactId);

    return res.status(200).json({ data: contact });
  } catch (error) {
    return handleServiceError(res, error, "Erro ao buscar contato.");
  }
});

router.patch("/admin/contacts/:contactId/status", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const contact = await updateContactRequestStatus(db, req.params.contactId, req.body?.status);

    return res.status(200).json({
      message: "Status do contato atualizado com sucesso.",
      data: contact,
    });
  } catch (error) {
    return handleServiceError(res, error, "Erro ao atualizar status do contato.");
  }
});

module.exports = router;
