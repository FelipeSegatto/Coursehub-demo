const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  listContractingParties,
  getContractingPartyById,
  createContractingParty,
  updateContractingParty,
  updateContractingPartyContact,
  updateContractingPartyStatus,
  searchActiveContractingParties,
} = require("../services/financial/contractingPartyService");

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
 * GET /api/admin/contracting-parties/search?term=...
 * Usado pelo passo 2 do wizard de contrato para localizar um
 * contratante terceiro já existente -- precisa vir antes de
 * "/:partyId" para não ser capturado pela rota de ID.
 */
router.get(
  "/admin/contracting-parties/search",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const results = await searchActiveContractingParties(db, req.query.term);

      return res.status(200).json({ data: results });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao buscar contratantes.");
    }
  }
);

router.get(
  "/admin/contracting-parties",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await listContractingParties(db, req.query);

      return res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao listar contratantes.");
    }
  }
);

router.get(
  "/admin/contracting-parties/:partyId",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const party = await getContractingPartyById(db, req.params.partyId);

      return res.status(200).json({ data: party });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao buscar contratante.");
    }
  }
);

router.post(
  "/admin/contracting-parties",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const party = await createContractingParty(db, req.body);

      return res.status(201).json({
        message: "Contratante criado com sucesso.",
        data: party,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao criar contratante.");
    }
  }
);

router.put(
  "/admin/contracting-parties/:partyId",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const party = await updateContractingParty(db, req.params.partyId, req.body);

      return res.status(200).json({
        message: "Contratante atualizado com sucesso.",
        data: party,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao atualizar contratante.");
    }
  }
);

/**
 * PATCH /api/admin/contracting-parties/:partyId/contact
 * Atualiza somente e-mail e telefone do cadastro mestre -- nunca
 * nome, documento, tipo ou status (esses continuam exclusivos do PUT
 * completo). Nunca altera contratos já existentes, que guardam seu
 * próprio snapshot congelado.
 */
router.patch(
  "/admin/contracting-parties/:partyId/contact",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const party = await updateContractingPartyContact(db, req.params.partyId, req.body);

      return res.status(200).json({
        message: "Contato do contratante atualizado com sucesso.",
        data: party,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao atualizar contato do contratante.");
    }
  }
);

router.patch(
  "/admin/contracting-parties/:partyId/status",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const party = await updateContractingPartyStatus(db, req.params.partyId, req.body.status);

      return res.status(200).json({
        message: "Status do contratante atualizado com sucesso.",
        data: party,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao atualizar status do contratante.");
    }
  }
);

module.exports = router;
