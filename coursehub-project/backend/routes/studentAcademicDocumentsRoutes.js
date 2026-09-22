const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");
const { getStudentIdByUserId, createServiceError } = require("../services/classes/classAccessService");

const {
  getEnrollmentDeclarationStatus,
  getEnrollmentDeclarationFile,
} = require("../services/academic/enrollmentDeclarationService");

const {
  getAttendanceDeclarationStatus,
  getAttendanceDeclarationFile,
} = require("../services/academic/attendanceDeclarationService");

const {
  getCompletionDeclarationStatus,
  getCompletionDeclarationFile,
} = require("../services/academic/completionDeclarationService");

const { getCertificateStatus, getCertificateFile } = require("../services/academic/certificateService");
const { listMyAcademicDocuments } = require("../services/academic/myAcademicDocumentsService");

const { mountDocumentAccessRoutes } = require("./helpers/documentAccessRoutes");

const router = express.Router();

/**
 * studentId sempre resolvido a partir do token, nunca de um
 * parâmetro de URL/corpo -- mesmo padrão de studentFinanceRoutes.js.
 */
async function resolveStudentAccessContext(req) {
  const studentId = await getStudentIdByUserId(db.promise(), req.auth.userId);

  if (!studentId) {
    throw createServiceError("Aluno não encontrado.", 404);
  }

  return { scope: "student", studentId };
}

const studentAuthMiddlewares = [authenticateToken, authorizeRoles("student")];

function attendancePeriodParams(req) {
  return {
    referencePeriodStart: req.query.referencePeriodStart,
    referencePeriodEnd: req.query.referencePeriodEnd,
  };
}

// Só leitura -- emissão nesta fase é sempre admin (mountRequestRoute: false
// não registra o POST de solicitar, só GET status e GET download).

mountDocumentAccessRoutes(router, {
  routePath: "/enrollments/:enrollmentId/declarations/enrollment",
  subjectParam: "enrollmentId",
  subjectServiceKey: "enrollmentId",
  authMiddlewares: studentAuthMiddlewares,
  resolveAccessContext: resolveStudentAccessContext,
  getDocumentStatus: getEnrollmentDeclarationStatus,
  getDocumentFile: getEnrollmentDeclarationFile,
  mountRequestRoute: false,
});

mountDocumentAccessRoutes(router, {
  routePath: "/enrollments/:enrollmentId/declarations/attendance",
  subjectParam: "enrollmentId",
  subjectServiceKey: "enrollmentId",
  authMiddlewares: studentAuthMiddlewares,
  resolveAccessContext: resolveStudentAccessContext,
  getDocumentStatus: getAttendanceDeclarationStatus,
  getDocumentFile: getAttendanceDeclarationFile,
  buildParams: attendancePeriodParams,
  mountRequestRoute: false,
});

mountDocumentAccessRoutes(router, {
  routePath: "/enrollments/:enrollmentId/declarations/completion",
  subjectParam: "enrollmentId",
  subjectServiceKey: "enrollmentId",
  authMiddlewares: studentAuthMiddlewares,
  resolveAccessContext: resolveStudentAccessContext,
  getDocumentStatus: getCompletionDeclarationStatus,
  getDocumentFile: getCompletionDeclarationFile,
  mountRequestRoute: false,
});

mountDocumentAccessRoutes(router, {
  routePath: "/enrollments/:enrollmentId/certificate",
  subjectParam: "enrollmentId",
  subjectServiceKey: "enrollmentId",
  authMiddlewares: studentAuthMiddlewares,
  resolveAccessContext: resolveStudentAccessContext,
  getDocumentStatus: getCertificateStatus,
  getDocumentFile: getCertificateFile,
  mountRequestRoute: false,
});

/**
 * GET /api/student/academic-documents/my-documents
 * Lista consolidada de declarações + certificados do aluno autenticado.
 */
router.get("/my-documents", ...studentAuthMiddlewares, async (req, res) => {
  try {
    const studentId = await getStudentIdByUserId(db.promise(), req.auth.userId);

    if (!studentId) {
      return res.status(404).json({ message: "Aluno não encontrado." });
    }

    const result = await listMyAcademicDocuments(db, { studentId });

    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Erro interno ao listar documentos.",
    });
  }
});

module.exports = router;
