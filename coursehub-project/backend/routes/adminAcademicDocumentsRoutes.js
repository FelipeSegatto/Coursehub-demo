const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");
const {
  documentGenerationRequestRateLimiter,
} = require("../middlewares/rateLimiters");

const {
  requestEnrollmentDeclaration,
  getEnrollmentDeclarationStatus,
  getEnrollmentDeclarationFile,
} = require("../services/academic/enrollmentDeclarationService");

const {
  requestAttendanceDeclaration,
  getAttendanceDeclarationStatus,
  getAttendanceDeclarationFile,
} = require("../services/academic/attendanceDeclarationService");

const {
  requestCompletionDeclaration,
  getCompletionDeclarationStatus,
  getCompletionDeclarationFile,
} = require("../services/academic/completionDeclarationService");

const { revokeDeclaration } = require("../services/academic/academicDeclarationEngine");

const {
  issueCertificate,
  getCertificateStatus,
  getCertificateFile,
  revokeCertificate,
  reissueCertificate,
} = require("../services/academic/certificateService");

const { evaluateEnrollmentCompletion } = require("../services/academic/enrollmentCompletionService");
const { listRuleVersions, createRuleVersion } = require("../services/academic/completionRuleService");

const { mountDocumentAccessRoutes } = require("./helpers/documentAccessRoutes");

const router = express.Router();

const adminAccessContext = async () => ({ scope: "admin" });
const adminAuthMiddlewares = [authenticateToken, authorizeRoles("admin")];

function attendancePeriodParams(req) {
  return {
    referencePeriodStart: req.query.referencePeriodStart || req.body?.referencePeriodStart,
    referencePeriodEnd: req.query.referencePeriodEnd || req.body?.referencePeriodEnd,
  };
}

mountDocumentAccessRoutes(router, {
  routePath: "/enrollments/:enrollmentId/declarations/enrollment",
  subjectParam: "enrollmentId",
  subjectServiceKey: "enrollmentId",
  authMiddlewares: adminAuthMiddlewares,
  resolveAccessContext: adminAccessContext,
  requestDocument: requestEnrollmentDeclaration,
  getDocumentStatus: getEnrollmentDeclarationStatus,
  getDocumentFile: getEnrollmentDeclarationFile,
});

mountDocumentAccessRoutes(router, {
  routePath: "/enrollments/:enrollmentId/declarations/attendance",
  subjectParam: "enrollmentId",
  subjectServiceKey: "enrollmentId",
  authMiddlewares: adminAuthMiddlewares,
  resolveAccessContext: adminAccessContext,
  requestDocument: requestAttendanceDeclaration,
  getDocumentStatus: getAttendanceDeclarationStatus,
  getDocumentFile: getAttendanceDeclarationFile,
  buildParams: attendancePeriodParams,
});

mountDocumentAccessRoutes(router, {
  routePath: "/enrollments/:enrollmentId/declarations/completion",
  subjectParam: "enrollmentId",
  subjectServiceKey: "enrollmentId",
  authMiddlewares: adminAuthMiddlewares,
  resolveAccessContext: adminAccessContext,
  requestDocument: requestCompletionDeclaration,
  getDocumentStatus: getCompletionDeclarationStatus,
  getDocumentFile: getCompletionDeclarationFile,
});

mountDocumentAccessRoutes(router, {
  routePath: "/enrollments/:enrollmentId/certificate",
  subjectParam: "enrollmentId",
  subjectServiceKey: "enrollmentId",
  authMiddlewares: adminAuthMiddlewares,
  resolveAccessContext: adminAccessContext,
  requestDocument: issueCertificate,
  getDocumentStatus: getCertificateStatus,
  getDocumentFile: getCertificateFile,
});

/**
 * GET /api/admin/academic-documents/enrollments/:enrollmentId/completion-eligibility
 * Consulta pura -- nunca emite nada, só avalia e explica requisito por requisito.
 */
router.get(
  "/enrollments/:enrollmentId/completion-eligibility",
  ...adminAuthMiddlewares,
  async (req, res) => {
    try {
      const result = await evaluateEnrollmentCompletion(db, req.params.enrollmentId);

      return res.status(200).json({ data: result });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        message: error.statusCode ? error.message : "Erro interno ao avaliar elegibilidade.",
      });
    }
  }
);

router.post("/declarations/:declarationId/revoke", ...adminAuthMiddlewares, async (req, res) => {
  try {
    await revokeDeclaration(db, {
      declarationId: req.params.declarationId,
      actorUserId: req.auth.userId,
      reason: req.body?.reason,
    });

    return res.status(200).json({ data: { revoked: true } });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Erro interno ao revogar a declaração.",
    });
  }
});

router.post("/certificates/:certificateId/revoke", ...adminAuthMiddlewares, async (req, res) => {
  try {
    await revokeCertificate(db, {
      certificateId: req.params.certificateId,
      actorUserId: req.auth.userId,
      reason: req.body?.reason,
    });

    return res.status(200).json({ data: { revoked: true } });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Erro interno ao revogar o certificado.",
    });
  }
});

router.post(
  "/certificates/:certificateId/reissue",
  ...adminAuthMiddlewares,
  documentGenerationRequestRateLimiter,
  async (req, res) => {
    try {
      const result = await reissueCertificate(db, {
        certificateId: req.params.certificateId,
        actorUserId: req.auth.userId,
      });

      return res.status(202).json({ data: result });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        message: error.statusCode ? error.message : "Erro interno ao reemitir o certificado.",
      });
    }
  }
);

router.get("/courses/:courseId/completion-rules", ...adminAuthMiddlewares, async (req, res) => {
  try {
    const result = await listRuleVersions(db, req.params.courseId);

    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Erro interno ao listar regras de conclusão.",
    });
  }
});

router.post("/courses/:courseId/completion-rules", ...adminAuthMiddlewares, async (req, res) => {
  try {
    const {
      minContentProgressPercentage,
      minAttendancePercentage,
      minAverageGrade,
      requireAllMandatoryItems,
    } = req.body || {};

    const result = await createRuleVersion(db, {
      courseId: req.params.courseId,
      minContentProgressPercentage,
      minAttendancePercentage,
      minAverageGrade,
      requireAllMandatoryItems,
      createdByUserId: req.auth.userId,
    });

    return res.status(201).json({ data: result });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Erro interno ao criar a regra de conclusão.",
    });
  }
});

module.exports = router;
