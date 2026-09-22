const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");
const { paymentCreateRateLimiter } = require("../middlewares/rateLimiters");

const {
  getStudentFinance,
} = require("../services/students/studentFinanceService");

const {
  createInvoicePayment,
  getInvoicePaymentByUser,
  simulateInvoicePaymentApproval,
} = require("../services/financial/studentPaymentService");

const {
  purchaseAdditionalCourseAsAuthenticatedStudent,
} = require("../services/financial/authenticatedCheckoutService");

const {
  getStudentIdByUserId,
  createServiceError,
} = require("../services/classes/classAccessService");

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

const {
  mountDocumentAccessRoutes,
} = require("./helpers/documentAccessRoutes");

const router = express.Router();

/**
 * studentId sempre resolvido a partir do token.
 * Nunca confiamos em studentId vindo do frontend.
 */
async function resolveStudentAccessContext(req) {
  const studentId = await getStudentIdByUserId(
    db.promise(),
    req.auth.userId
  );

  if (!studentId) {
    throw createServiceError(
      "Aluno não encontrado.",
      404
    );
  }

  return {
    scope: "student",
    studentId,
  };
}

const studentAuthMiddlewares = [
  authenticateToken,
  authorizeRoles("student"),
];

/**
 * ============================================================
 * DOCUMENTO DO CONTRATO
 * ============================================================
 */
mountDocumentAccessRoutes(router, {
  routePath:
    "/student/finance/contracts/:contractId/document",

  subjectParam: "contractId",
  subjectServiceKey: "contractId",

  authMiddlewares:
    studentAuthMiddlewares,

  resolveAccessContext:
    resolveStudentAccessContext,

  requestDocument:
    requestContractDocument,

  getDocumentStatus:
    getContractDocumentStatus,

  getDocumentFile:
    getContractDocumentFile,
});

/**
 * ============================================================
 * SEGUNDA VIA DA INVOICE
 * ============================================================
 */
mountDocumentAccessRoutes(router, {
  routePath:
    "/student/finance/invoices/:invoiceId/document",

  subjectParam: "invoiceId",
  subjectServiceKey: "invoiceId",

  authMiddlewares:
    studentAuthMiddlewares,

  resolveAccessContext:
    resolveStudentAccessContext,

  requestDocument:
    requestInvoiceCopyDocument,

  getDocumentStatus:
    getInvoiceCopyDocumentStatus,

  getDocumentFile:
    getInvoiceCopyDocumentFile,
});

/**
 * ============================================================
 * RECIBO DO PAGAMENTO
 * ============================================================
 */
mountDocumentAccessRoutes(router, {
  routePath:
    "/student/finance/payments/:paymentId/receipt",

  subjectParam: "paymentId",
  subjectServiceKey: "paymentId",

  authMiddlewares:
    studentAuthMiddlewares,

  resolveAccessContext:
    resolveStudentAccessContext,

  requestDocument:
    requestPaymentReceipt,

  getDocumentStatus:
    getPaymentReceiptStatus,

  getDocumentFile:
    getPaymentReceiptFile,
});

/**
 * ============================================================
 * GET /api/student/finance
 * ============================================================
 *
 * Alimenta a página Financeiro do aluno.
 */
router.get(
  "/student/finance",

  authenticateToken,
  authorizeRoles("student"),

  async (req, res) => {
    try {
      const result =
        await getStudentFinance(
          db,
          req.auth.userId
        );

      return res
        .status(200)
        .json(result);
    } catch (error) {
      console.error(
        "Erro ao buscar dados financeiros do aluno:",
        error
      );

      return res
        .status(error.statusCode || 500)
        .json({
          message:
            error.statusCode
              ? error.message
              : "Erro interno ao buscar os dados financeiros.",
        });
    }
  }
);

/**
 * ============================================================
 * POST /api/student/finance/invoices/:invoiceId/payments
 * ============================================================
 *
 * Inicia pagamento de uma cobrança já existente.
 */
router.post(
  "/student/finance/invoices/:invoiceId/payments",

  authenticateToken,
  authorizeRoles("student"),
  paymentCreateRateLimiter,

  async (req, res) => {
    try {
      const {
        paymentMethod,
      } = req.body || {};

      const result =
        await createInvoicePayment(
          db,
          {
            userId:
              req.auth.userId,

            invoiceId:
              req.params.invoiceId,

            paymentMethod,
          }
        );

      return res
        .status(201)
        .json({
          data: result,
        });
    } catch (error) {
      console.error(
        "Erro ao criar pagamento:",
        error
      );

      return res
        .status(error.statusCode || 500)
        .json({
          message:
            error.statusCode
              ? error.message
              : "Não foi possível criar o pagamento.",
        });
    }
  }
);

/**
 * ============================================================
 * POST /api/student/finance/courses/:courseId/checkout
 * ============================================================
 *
 * Compra de novo curso por aluno já autenticado.
 */
router.post(
  "/student/finance/courses/:courseId/checkout",

  authenticateToken,
  authorizeRoles("student"),
  paymentCreateRateLimiter,

  async (req, res) => {
    try {
      const {
        pricingPlanId,
        paymentMethod,

        cardToken,
        cardPaymentMethodId,
        cardInstallments,

        acceptance,
      } = req.body || {};

      const result =
        await purchaseAdditionalCourseAsAuthenticatedStudent(
          db,
          {
            userId:
              req.auth.userId,

            courseId:
              req.params.courseId,

            pricingPlanId,

            paymentMethod,

            cardToken,
            cardPaymentMethodId,
            cardInstallments,

            acceptance,

            ipAddress:
              req.ip,

            userAgent:
              req.get("user-agent"),
          }
        );

      return res
        .status(201)
        .json({
          data: result,
        });
    } catch (error) {
      console.error(
        "Erro ao comprar curso:",
        error
      );

      return res
        .status(error.statusCode || 500)
        .json({
          message:
            error.statusCode
              ? error.message
              : "Não foi possível concluir a compra.",
        });
    }
  }
);


/**
 * Confirma um PIX simulado durante a demonstração.
 */
router.post(
  "/student/finance/payments/:paymentId/simulate-approval",
  authenticateToken,
  authorizeRoles("student"),
  async (req, res) => {
    try {
      const result = await simulateInvoicePaymentApproval(db, {
        userId: req.auth.userId,
        paymentId: req.params.paymentId,
      });
      return res.status(200).json({ data: result });
    } catch (error) {
      console.error("Erro ao confirmar pagamento simulado:", error);
      return res.status(error.statusCode || 500).json({
        message: error.statusCode ? error.message : "Não foi possível confirmar o pagamento simulado.",
      });
    }
  }
);

/**
 * ============================================================
 * GET /api/student/finance/payments/:paymentId
 * ============================================================
 *
 * Usado também pelo polling do checkout.
 */
router.get(
  "/student/finance/payments/:paymentId",

  authenticateToken,
  authorizeRoles("student"),

  async (req, res) => {
    try {
      const result =
        await getInvoicePaymentByUser(
          db,
          {
            userId:
              req.auth.userId,

            paymentId:
              req.params.paymentId,
          }
        );

      return res
        .status(200)
        .json({
          data: result,
        });
    } catch (error) {
      console.error(
        "Erro ao consultar pagamento:",
        error
      );

      return res
        .status(error.statusCode || 500)
        .json({
          message:
            error.statusCode
              ? error.message
              : "Não foi possível consultar o pagamento.",
        });
    }
  }
);

module.exports = router;