/**
 * Monta o trio de rotas repetido para cada (tipo de documento x
 * superfície de acesso): POST solicitar (idempotente) / GET status /
 * GET download. Usado por adminFinancialRoutes.js e
 * studentFinanceRoutes.js para os 3 tipos de documento financeiro da
 * Fase 1 -- 6 combinações no total, mesmo shape de resposta e mesmo
 * tratamento de erro em todas, então centralizar aqui evita copiar o
 * mesmo boilerplate 6 vezes.
 *
 * A rota nunca fala com o renderer/Puppeteer -- só com o service de
 * domínio (request/getStatus/getFile) e, no download, com
 * documentStorageService para ler o arquivo já pronto.
 */
const db = require("../../db");
const { readDocument } = require("../../services/documents/documentStorageService");
const {
  documentGenerationRequestRateLimiter,
  documentDownloadRateLimiter,
} = require("../../middlewares/rateLimiters");

/**
 * @param {import('express').Router} router
 * @param {object} config
 * @param {string} config.routePath - ex: "/contracts/:contractId/document"
 * @param {string} config.subjectParam - nome do :param na URL, ex: "contractId"
 * @param {string} config.subjectServiceKey - nome da chave esperada pelo service, ex: "contractId"
 * @param {Function[]} config.authMiddlewares - ex: [authenticateToken, authorizeRoles("admin")]
 * @param {(req: import('express').Request) => Promise<object>} config.resolveAccessContext
 * @param {Function} config.requestDocument - (db, {[subjectServiceKey], actorUserId, accessContext, params?}) => Promise<dto>
 * @param {Function} config.getDocumentStatus - (db, {[subjectServiceKey], accessContext, params?}) => Promise<dto>
 * @param {Function} config.getDocumentFile - (db, {[subjectServiceKey], accessContext, params?}) => Promise<{storageKey, filename}>
 * @param {(req: import('express').Request) => object} [config.buildParams] - extra params (ex: período de referência), lidos de query (GET) ou body (POST)
 * @param {boolean} [config.mountRequestRoute=true] - false para superfícies só-leitura (ex: aluno, professor) -- não registra o POST de solicitar
 */
function mountDocumentAccessRoutes(
  router,
  {
    routePath,
    subjectParam,
    subjectServiceKey,
    authMiddlewares,
    resolveAccessContext,
    requestDocument,
    getDocumentStatus,
    getDocumentFile,
    buildParams,
    mountRequestRoute = true,
  }
) {
  if (mountRequestRoute) {
    router.post(routePath, ...authMiddlewares, documentGenerationRequestRateLimiter, async (req, res) => {
      try {
        const accessContext = await resolveAccessContext(req);

        const result = await requestDocument(db, {
          [subjectServiceKey]: req.params[subjectParam],
          actorUserId: req.auth.userId,
          accessContext,
          params: buildParams ? buildParams(req) : {},
        });

        return res.status(202).json({ data: result });
      } catch (error) {
        console.error(`Erro ao solicitar documento (${routePath}):`, error);

        return res.status(error.statusCode || 500).json({
          message: error.statusCode ? error.message : "Erro interno ao solicitar o documento.",
        });
      }
    });
  }

  router.get(routePath, ...authMiddlewares, async (req, res) => {
    try {
      const accessContext = await resolveAccessContext(req);

      const result = await getDocumentStatus(db, {
        [subjectServiceKey]: req.params[subjectParam],
        accessContext,
        params: buildParams ? buildParams(req) : {},
      });

      return res.status(200).json({ data: result });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        message: error.statusCode ? error.message : "Erro interno ao consultar o documento.",
      });
    }
  });

  router.get(`${routePath}/download`, ...authMiddlewares, documentDownloadRateLimiter, async (req, res) => {
    try {
      const accessContext = await resolveAccessContext(req);

      const { storageKey, filename } = await getDocumentFile(db, {
        [subjectServiceKey]: req.params[subjectParam],
        accessContext,
        params: buildParams ? buildParams(req) : {},
      });

      const buffer = await readDocument(storageKey);

      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      });

      return res.status(200).send(buffer);
    } catch (error) {
      console.error(`Erro ao baixar documento (${routePath}):`, error);

      return res.status(error.statusCode || 500).json({
        message: error.statusCode ? error.message : "Erro interno ao baixar o documento.",
      });
    }
  });
}

module.exports = { mountDocumentAccessRoutes };
