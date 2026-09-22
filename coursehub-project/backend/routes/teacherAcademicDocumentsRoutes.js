const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");
const { requireOwnedClass, createServiceError } = require("../services/teacher/teacherClassService");
const { evaluateEnrollmentCompletion } = require("../services/academic/enrollmentCompletionService");

const router = express.Router();

/**
 * GET /api/teacher/academic-documents/classes/:classId/students/:studentId/completion-eligibility
 * Só leitura -- professor consulta elegibilidade de um aluno da
 * própria turma (requireOwnedClass), nunca emite/revoga nada.
 */
router.get(
  "/classes/:classId/students/:studentId/completion-eligibility",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const { classId, studentId } = req.params;

      await requireOwnedClass(db.promise(), { userId: req.auth.userId, classId });

      const [enrollmentRows] = await db
        .promise()
        .query(`SELECT id FROM enrollments WHERE class_id = ? AND student_id = ? LIMIT 1`, [classId, studentId]);

      if (enrollmentRows.length === 0) {
        throw createServiceError("Matrícula não encontrada nesta turma.", 404);
      }

      const result = await evaluateEnrollmentCompletion(db, enrollmentRows[0].id);

      return res.status(200).json({ data: result });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        message: error.statusCode ? error.message : "Erro interno ao avaliar elegibilidade.",
      });
    }
  }
);

module.exports = router;
