const express = require("express");
const db = require("../db");

const authenticateToken =
  require("../middlewares/authenticateToken");

const authorizeRoles =
  require("../middlewares/authorizeRoles");

const {
  reportExportRateLimiter,
} =
  require("../middlewares/rateLimiters");


const {
  listEnrollmentsForProgress,
  getEnrollmentProgressDetail,
} =
  require("../services/teacher/teacherStudentProgressService");


const {
  generateStudentProgressPdf,
} =
  require("../services/reports/studentProgressPdfService");


const router =
  express.Router();


/**
 * ============================================================
 * TRATAMENTO DE ERRO DOS SERVICES
 * ============================================================
 */
function handleServiceError(
  res,
  error,
  fallbackMessage
) {

  console.error(
    fallbackMessage,
    error
  );


  if (
    error.statusCode
  ) {

    return res
      .status(
        error.statusCode
      )
      .json({
        message:
          error.message,
      });
  }


  return res
    .status(500)
    .json({
      message:
        fallbackMessage,
    });
}


/**
 * ============================================================
 * LISTAGEM DE PROGRESSO DOS ALUNOS
 * ============================================================
 *
 * GET
 * /api/teacher/by-user/:userId/student-progress
 *
 *
 * IMPORTANTE:
 *
 * A identidade utilizada pelo backend vem de:
 *
 * req.auth.userId
 *
 * e não do :userId enviado pela URL.
 *
 * Isso é uma proteção contra manipulação de IDs.
 */
router.get(
  "/teacher/by-user/:userId/student-progress",

  authenticateToken,

  authorizeRoles(
    "teacher"
  ),

  async (
    req,
    res
  ) => {

    try {

      const result =
        await listEnrollmentsForProgress(
          db,
          {
            userId:
              req.auth.userId,

            courseId:
              req.query.courseId,

            classId:
              req.query.classId,

            page:
              req.query.page,

            limit:
              req.query.limit,
          }
        );


      return res
        .status(200)
        .json(
          result
        );

    } catch (error) {

      return handleServiceError(
        res,
        error,
        "Erro ao buscar progressão dos alunos."
      );
    }
  }
);


/**
 * ============================================================
 * DETALHES DO PROGRESSO DE UMA MATRÍCULA
 * ============================================================
 *
 * GET
 * /api/teacher/by-user/:userId/student-progress/
 * enrollments/:enrollmentId
 */
router.get(
  "/teacher/by-user/:userId/student-progress/enrollments/:enrollmentId",

  authenticateToken,

  authorizeRoles(
    "teacher"
  ),

  async (
    req,
    res
  ) => {

    try {

      const result =
        await getEnrollmentProgressDetail(
          db,
          {
            userId:
              req.auth.userId,

            enrollmentId:
              req.params.enrollmentId,
          }
        );


      return res
        .status(200)
        .json(
          result
        );

    } catch (error) {

      return handleServiceError(
        res,
        error,
        "Erro ao buscar o progresso da matrícula."
      );
    }
  }
);


/**
 * ============================================================
 * EXPORTAÇÃO DO PROGRESSO EM PDF
 * ============================================================
 *
 * GET
 * /api/teacher/by-user/:userId/student-progress/
 * enrollments/:enrollmentId/export.pdf
 *
 *
 * Ordem dos middlewares:
 *
 * 1. authenticateToken
 *
 *    confirma a sessão.
 *
 *
 * 2. authorizeRoles("teacher")
 *
 *    confirma que é professor.
 *
 *
 * 3. reportExportRateLimiter
 *
 *    limita a geração de PDFs por professor.
 *
 *
 * 4. handler
 *
 *    busca os dados e gera o PDF.
 */
router.get(
  "/teacher/by-user/:userId/student-progress/enrollments/:enrollmentId/export.pdf",

  authenticateToken,

  authorizeRoles(
    "teacher"
  ),

  reportExportRateLimiter,

  async (
    req,
    res
  ) => {

    try {

      /**
       * Busca os mesmos dados utilizados
       * na tela de progresso.
       */
      const detail =
        await getEnrollmentProgressDetail(
          db,
          {
            userId:
              req.auth.userId,

            enrollmentId:
              req.params.enrollmentId,
          }
        );


      /**
       * Gera o PDF.
       */
      const {
        buffer,
        filename,
      } =
        await generateStudentProgressPdf(
          db,
          {
            detail,

            actorUserId:
              req.auth.userId,
          }
        );


      /**
       * Headers corretos para download.
       */
      res.set({
        "Content-Type":
          "application/pdf",

        "Content-Disposition":
          `attachment; filename="${filename}"`,

        "X-Content-Type-Options":
          "nosniff",

        "Cache-Control":
          "no-store",
      });


      return res
        .status(200)
        .send(
          buffer
        );

    } catch (error) {

      console.error(
        "Erro ao gerar PDF de progresso do aluno:",
        error
      );


      return res
        .status(
          error.statusCode ||
            500
        )
        .json({
          message:
            error.statusCode
              ? error.message
              : "Erro interno ao gerar o PDF.",
        });
    }
  }
);


module.exports =
  router;