const express = require("express");

const router = express.Router();

/**
 * GET /api/users e POST /api/users foram removidos de propósito.
 *
 * Listagem de usuários é administrativa (GET /api/admin/users).
 * Cadastro de aluno é checkout público/autenticado ou o wizard
 * admin — não há autoatendimento aberto.
 */

module.exports = router;
