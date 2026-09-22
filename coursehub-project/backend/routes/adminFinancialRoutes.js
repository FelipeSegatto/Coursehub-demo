const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");
const { invoicePaymentLinkAdminRateLimiter } = require("../middlewares/rateLimiters");

const {
  changeInvoiceDueDate,
} = require("../services/financial/invoiceService");

const {
  registerManualPayment,
} = require("../services/financial/paymentService");

const {
  changeInvoiceAmount,
} = require("../services/financial/invoiceAmountService");

const {
  cancelInvoice,
} = require("../services/financial/invoiceCancellationService");

const {
  refundPayment,
} = require("../services/financial/paymentRefundService");

const {
  getInvoiceDetails,
  getFinancialContractEvents,
} = require("../services/financial/financialQueryService");

const {
  listFinancialContracts,
  getFinancialContractDetails,
  listFinancialInvoices,
  getFinancialDashboardSummary,
} = require(
  "../services/financial/adminFinancialReadService"
);

const {
  createStudentContractWithInitialInvoice,
  resendContractBilling,
} = require("../services/financial/contractCreationService");

const {
  cancelFinancialContract,
} = require("../services/financial/contractCancellationService");

const {
  getContractWithdrawalImpact,
  registerContractWithdrawal,
} = require("../services/financial/contractWithdrawalService");

const {
  getContractTermsDocumentHtml,
} = require("../services/financial/contractTermsDocumentService");

const {
  shareInvoicePaymentLink,
} = require("../services/financial/invoicePaymentAccessService");

const {
  requestContractDocument,
  getContractDocumentStatus,
  getContractDocumentFile,
} = require("../services/financial/financialContractDocumentService");

const {
  requestInvoiceCopyDocument,
  getInvoiceCopyDocumentStatus,
  getInvoiceCopyDocumentFile,
} = require("../services/financial/invoiceCopyDocumentService");

const {
  requestPaymentReceipt,
  getPaymentReceiptStatus,
  getPaymentReceiptFile,
} = require("../services/financial/paymentReceiptDocumentService");

const { mountDocumentAccessRoutes } = require("./helpers/documentAccessRoutes");

const router = express.Router();

const adminAccessContext = async () => ({ scope: "admin" });
const adminAuthMiddlewares = [authenticateToken, authorizeRoles("admin")];

mountDocumentAccessRoutes(router, {
  routePath: "/contracts/:contractId/document",
  subjectParam: "contractId",
  subjectServiceKey: "contractId",
  authMiddlewares: adminAuthMiddlewares,
  resolveAccessContext: adminAccessContext,
  requestDocument: requestContractDocument,
  getDocumentStatus: getContractDocumentStatus,
  getDocumentFile: getContractDocumentFile,
});

mountDocumentAccessRoutes(router, {
  routePath: "/invoices/:invoiceId/document",
  subjectParam: "invoiceId",
  subjectServiceKey: "invoiceId",
  authMiddlewares: adminAuthMiddlewares,
  resolveAccessContext: adminAccessContext,
  requestDocument: requestInvoiceCopyDocument,
  getDocumentStatus: getInvoiceCopyDocumentStatus,
  getDocumentFile: getInvoiceCopyDocumentFile,
});

mountDocumentAccessRoutes(router, {
  routePath: "/payments/:paymentId/receipt",
  subjectParam: "paymentId",
  subjectServiceKey: "paymentId",
  authMiddlewares: adminAuthMiddlewares,
  resolveAccessContext: adminAccessContext,
  requestDocument: requestPaymentReceipt,
  getDocumentStatus: getPaymentReceiptStatus,
  getDocumentFile: getPaymentReceiptFile,
});

router.patch(
  "/invoices/:invoiceId/due-date",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const userId = req.auth.userId;
      const invoiceId = Number(req.params.invoiceId);
      const { dueDate, reason } = req.body;

        if (!dueDate) {
        return res.status(400).json({
            message: "A nova data de vencimento é obrigatória.",
        });
        }

        const result = await changeInvoiceDueDate(db, {
        invoiceId,
        dueDate,
        reason,
        actorUserId: userId,
        });

      return res.status(200).json({
        message: "Data de vencimento alterada com sucesso.",
        data: result,
      });
    } catch (error) {
      console.error(
        "Erro ao alterar data de vencimento:",
        error
      );

      return res.status(error.statusCode || 500).json({
        message:
          error.message ||
          "Erro ao alterar data de vencimento.",
      });
    }
  }
);

console.log("adminFinancialRoutes carregado");
// Registra manualmente o pagamento integral de uma fatura,
// atualiza seus status e registra o histórico financeiro.
router.post(
  "/invoices/:invoiceId/manual-payment",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {

    console.log("POST manual-payment chamado");
    try {
      const userId = req.auth.userId;

      const invoiceId = Number(req.params.invoiceId);

      const {
        amount,
        paymentMethod,
        paymentDate,
        reason,
      } = req.body;

      const result =
        await registerManualPayment(db, {
          invoiceId,
          amount,
          paymentMethod,
          paymentDate,
          reason,
          actorUserId: userId,
        });

      return res.status(201).json({
        message:
          "Pagamento registrado com sucesso.",
        data: result,
      });
    } catch (error) {
      console.error(
        "Erro ao registrar pagamento:",
        error
      );

      return res.status(
        error.statusCode || 500
      ).json({
        message:
          error.message ||
          "Erro ao registrar pagamento.",
      });
    }
  }
);

// Altera o valor de uma fatura aberta e registra
// a alteração no histórico financeiro.
console.log("Rota de alteração de valor carregada");
router.patch(
  "/invoices/:invoiceId/amount",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const userId = req.auth.userId;
      const invoiceId = Number(
        req.params.invoiceId
      );

      const {
        newAmount,
        reason,
      } = req.body;

      const result = await changeInvoiceAmount(db, {
        invoiceId,
        newAmount,
        reason,
        actorUserId: userId,
      });

      return res.status(200).json({
        message:
          "Valor da fatura alterado com sucesso.",
        invoice: result,
      });
    } catch (error) {
      console.error(
        "Erro ao alterar o valor da fatura:",
        error
      );

      return res
        .status(error.statusCode || 500)
        .json({
          message:
            error.message ||
            "Erro interno ao alterar o valor da fatura.",
        });
    }
  }
);

// Cancela uma fatura aberta, remove ações de cobrança
// pendentes e registra o evento financeiro.
router.post(
  "/invoices/:invoiceId/cancel",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const userId = req.auth.userId;
      const invoiceId = Number(
        req.params.invoiceId
      );

      const {
        reason,
      } = req.body;

      const result = await cancelInvoice(db, {
        invoiceId,
        reason,
        actorUserId: userId,
      });

      return res.status(200).json({
        message:
          "Fatura cancelada com sucesso.",
        invoice: result,
      });
    } catch (error) {
      console.error(
        "Erro ao cancelar a fatura:",
        error
      );

      return res
        .status(error.statusCode || 500)
        .json({
          message:
            error.message ||
            "Erro interno ao cancelar a fatura.",
        });
    }
  }
);

// Registra o reembolso integral de um pagamento aprovado,
// atualiza a fatura e registra o histórico financeiro.
router.post(
  "/payments/:paymentId/refund",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const userId = req.auth.userId;
      const paymentId = Number(
        req.params.paymentId
      );

      const { reason } = req.body;

      const result = await refundPayment(db, {
        paymentId,
        reason,
        actorUserId: userId,
      });

      return res.status(200).json({
        message:
          "Pagamento reembolsado com sucesso.",
        data: result,
      });
    } catch (error) {
      console.error(
        "Erro ao reembolsar pagamento:",
        error
      );

      return res
        .status(error.statusCode || 500)
        .json({
          message:
            error.message ||
            "Erro interno ao reembolsar o pagamento.",
        });
    }
  }
);

// Retorna os detalhes completos de uma fatura,
// incluindo contrato, pagamentos, cobranças e eventos.
router.get(
  "/invoices/:invoiceId",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const invoiceId = Number(
        req.params.invoiceId
      );

      const result = await getInvoiceDetails(
        db,
        invoiceId
      );

      return res.status(200).json({
        data: result,
      });
    } catch (error) {
      console.error(
        "Erro ao consultar os detalhes da fatura:",
        error
      );

      return res
        .status(error.statusCode || 500)
        .json({
          message:
            error.message ||
            "Erro interno ao consultar os detalhes da fatura.",
        });
    }
  }
);

router.get(
  "/contracts/:contractId/events",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const contractId = Number(
        req.params.contractId
      );

      const result =
        await getFinancialContractEvents(
          db,
          contractId
        );

      return res.status(200).json({
        data: result,
      });
    } catch (error) {
      console.error(
        "Erro ao consultar eventos do contrato:",
        error
      );

      return res
        .status(error.statusCode || 500)
        .json({
          message:
            error.message ||
            "Não foi possível consultar os eventos do contrato financeiro.",
        });
    }
  }
);

/**
 * POST /api/admin/financial/contracts
 * Fluxo central de contratação: aluno -> contratante -> contrato
 * pending_payment -> primeira fatura. Nunca cria matrícula aqui.
 */
router.post(
  "/contracts",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await createStudentContractWithInitialInvoice(
        db,
        req.body,
        req.auth.userId
      );

      return res.status(201).json({
        message: "Contrato criado com sucesso.",
        data: result,
      });
    } catch (error) {
      console.error("Erro ao criar contrato:", error);

      return res.status(error.statusCode || 500).json({
        message: error.message || "Erro interno ao criar contrato.",
      });
    }
  }
);

/**
 * POST /api/admin/financial/contracts/:contractId/cancel
 */
router.post(
  "/contracts/:contractId/cancel",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await cancelFinancialContract(db, req.params.contractId, {
        reason: req.body?.reason,
        actorUserId: req.auth.userId,
      });

      return res.status(200).json({
        message: "Contrato cancelado com sucesso.",
        data: result,
      });
    } catch (error) {
      console.error("Erro ao cancelar contrato:", error);

      return res.status(error.statusCode || 500).json({
        message: error.message || "Erro interno ao cancelar contrato.",
      });
    }
  }
);

/**
 * GET /api/admin/financial/contracts/:contractId/withdrawal-impact
 * Prévia consultada pelo modal antes de confirmar a desistência.
 */
router.get(
  "/contracts/:contractId/withdrawal-impact",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await getContractWithdrawalImpact(db, req.params.contractId);

      return res.status(200).json({ data: result });
    } catch (error) {
      console.error("Erro ao consultar impacto da desistência:", error);

      return res.status(error.statusCode || 500).json({
        message: error.message || "Erro interno ao consultar o impacto da desistência.",
      });
    }
  }
);

/**
 * POST /api/admin/financial/contracts/:contractId/withdrawal
 * Registra a desistência: encerra contrato + matrícula, trata
 * faturas conforme a política escolhida, nunca reembolsa
 * automaticamente.
 */
router.post(
  "/contracts/:contractId/withdrawal",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await registerContractWithdrawal(db, req.params.contractId, {
        reason: req.body?.reason,
        notes: req.body?.notes,
        overdueInvoiceAction: req.body?.overdueInvoiceAction,
        actorUserId: req.auth.userId,
      });

      return res.status(200).json({
        message:
          "Desistência registrada. O contrato foi encerrado e a matrícula do aluno foi desativada.",
        data: result,
      });
    } catch (error) {
      console.error("Erro ao registrar desistência:", error);

      return res.status(error.statusCode || 500).json({
        message: error.message || "Erro interno ao registrar a desistência.",
      });
    }
  }
);

/**
 * POST /api/admin/financial/contracts/:contractId/send-invoice
 * Reenvia o e-mail de cobrança da fatura de ativação em aberto.
 */
router.post(
  "/contracts/:contractId/send-invoice",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await resendContractBilling(
        db,
        req.params.contractId,
        req.auth.userId
      );

      return res.status(200).json(result);
    } catch (error) {
      console.error("Erro ao reenviar cobrança:", error);

      return res.status(error.statusCode || 500).json({
        message: error.message || "Erro interno ao reenviar cobrança.",
      });
    }
  }
);

/**
 * POST /api/admin/financial/invoices/:invoiceId/payment-link
 * Gera/compartilha o link privado de pagamento da fatura --
 * deliveryMethod copy_link | email | whatsapp_message. Cada chamada
 * invalida qualquer link anterior. copy_link e whatsapp_message
 * devolvem o link/mensagem em claro nesta resposta, uma única vez.
 */
router.post(
  "/invoices/:invoiceId/payment-link",
  authenticateToken,
  authorizeRoles("admin"),
  invoicePaymentLinkAdminRateLimiter,
  async (req, res) => {
    try {
      const invoiceId = Number(req.params.invoiceId);
      const { deliveryMethod } = req.body || {};

      const result = await shareInvoicePaymentLink(db, {
        invoiceId,
        deliveryMethod,
        actorUserId: req.auth.userId,
      });

      if (result.paymentLinkUrl || result.message) {
        res.set("Cache-Control", "no-store");
      }

      return res.status(200).json({ data: result });
    } catch (error) {
      console.error("Erro ao compartilhar link de pagamento da fatura:", error);

      return res.status(error.statusCode || 500).json({
        message: error.message || "Erro interno ao compartilhar o link de pagamento.",
      });
    }
  }
);

/**
 * GET /api/admin/financial/contracts/:contractId/terms-document
 * Devolve o HTML congelado do contrato (nunca re-renderizado) --
 * servido como documento navegável/imprimível, não como JSON.
 */
router.get(
  "/contracts/:contractId/terms-document",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const html = await getContractTermsDocumentHtml(db, req.params.contractId);

      res.set("Content-Type", "text/html; charset=utf-8");

      return res.status(200).send(html);
    } catch (error) {
      console.error("Erro ao carregar documento do contrato:", error);

      return res.status(error.statusCode || 500).send(
        `<p style="font-family: sans-serif; padding: 40px;">${
          error.statusCode
            ? error.message
            : "Erro interno ao carregar o documento do contrato."
        }</p>`
      );
    }
  }
);

router.get(
  "/contracts",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result =
        await listFinancialContracts(
          db,
          {
            page: req.query.page,
            limit: req.query.limit,
            status: req.query.status,
            billingType:
              req.query.billingType,
            enrollmentId:
              req.query.enrollmentId,
            search: req.query.search,
          }
        );

      return res.status(200).json({
        data: result,
      });
    } catch (error) {
      console.error(
        "Erro ao listar contratos financeiros:",
        error
      );

      return res
        .status(error.statusCode || 500)
        .json({
          message:
            error.message ||
            "Erro interno ao listar contratos financeiros.",
        });
    }
  }
);

router.get(
  "/contracts/:contractId",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const contractId = Number(
        req.params.contractId
      );

      const result =
        await getFinancialContractDetails(
          db,
          contractId
        );

      return res.status(200).json({
        data: result,
      });
    } catch (error) {
      console.error(
        "Erro ao consultar contrato financeiro:",
        error
      );

      return res
        .status(error.statusCode || 500)
        .json({
          message:
            error.message ||
            "Erro interno ao consultar o contrato financeiro.",
        });
    }
  }
);

router.get(
  "/invoices",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result =
        await listFinancialInvoices(
          db,
          {
            page: req.query.page,
            limit: req.query.limit,
            status: req.query.status,
            contractId:
              req.query.contractId,
            dueFrom: req.query.dueFrom,
            dueTo: req.query.dueTo,
            search: req.query.search,
          }
        );

      return res.status(200).json({
        data: result,
      });
    } catch (error) {
      console.error(
        "Erro ao listar faturas:",
        error
      );

      return res
        .status(error.statusCode || 500)
        .json({
          message:
            error.message ||
            "Erro interno ao listar faturas.",
        });
    }
  }
);

router.get(
  "/dashboard/summary",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result =
        await getFinancialDashboardSummary(db);

      return res.status(200).json({
        data: result,
      });
    } catch (error) {
      console.error(
        "[GET /dashboard/summary] erro:",
        error
      );

      return res
        .status(error.statusCode || 500)
        .json({
          message:
            error.message ||
            "Erro interno ao carregar dashboard financeiro.",
        });
    }
  }
);

module.exports = router;