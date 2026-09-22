const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  listTeacherCourseContents,
  listClassCourseContents,
  createCourseContent,
  updateCourseContent,
  archiveCourseContent,
} = require("../services/courseContents/teacherCourseContentService");

const router = express.Router();

/**
 * GET /api/teacher/by-user/:userId/course-contents
 * Filtros opcionais via query string: courseId, classId, status, type.
 */
router.get(
  "/teacher/by-user/:userId/course-contents",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const contents = await listTeacherCourseContents(db, {
        userId: req.auth.userId,
        courseId: req.query.courseId,
        classId: req.query.classId,
        status: req.query.status,
        type: req.query.type,
      });

      return res.status(200).json(contents);
    } catch (error) {
      console.error(
        "Erro ao buscar conteúdos do professor:",
        error
      );

      return res.status(error.statusCode || 500).json({
        message:
          error.message || "Erro ao buscar conteúdos do professor.",
      });
    }
  }
);

/**
 * GET /api/teacher/by-user/:userId/classes/:classId/contents
 * Conteúdos gerais do curso + exclusivos da turma informada.
 */
router.get(
  "/teacher/by-user/:userId/classes/:classId/contents",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const result = await listClassCourseContents(db, {
        userId: req.auth.userId,
        classId: req.params.classId,
        status: req.query.status,
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error(
        "Erro ao listar conteúdos da turma:",
        error
      );

      return res.status(error.statusCode || 500).json({
        message:
          error.message ||
          "Erro interno ao buscar os conteúdos da turma.",
      });
    }
  }
);

/**
 * POST /api/course-contents
 */
router.post(
  "/course-contents",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const content = await createCourseContent(db, {
        userId: req.auth.userId,
        payload: req.body,
      });

      return res.status(201).json({
        message: "Conteúdo criado com sucesso.",
        content,
      });
    } catch (error) {
      console.error("Erro ao criar conteúdo:", error);

      return res.status(error.statusCode || 500).json({
        message: error.message || "Erro ao criar conteúdo.",
      });
    }
  }
);

/**
 * PUT /api/course-contents/:id
 */
router.put(
  "/course-contents/:id",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const content = await updateCourseContent(db, {
        userId: req.auth.userId,
        contentId: req.params.id,
        payload: req.body,
      });

      return res.status(200).json({
        message: "Conteúdo atualizado com sucesso.",
        content,
      });
    } catch (error) {
      console.error("Erro ao atualizar conteúdo:", error);

      return res.status(error.statusCode || 500).json({
        message: error.message || "Erro ao atualizar conteúdo.",
      });
    }
  }
);

/**
 * DELETE /api/course-contents/:id
 * Soft delete — arquiva o conteúdo sem removê-lo do banco.
 */
router.delete(
  "/course-contents/:id",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const result = await archiveCourseContent(db, {
        userId: req.auth.userId,
        contentId: req.params.id,
      });

      return res.status(200).json({
        message: "Conteúdo arquivado com sucesso.",
        ...result,
      });
    } catch (error) {
      console.error("Erro ao arquivar conteúdo:", error);

      return res.status(error.statusCode || 500).json({
        message: error.message || "Erro ao arquivar conteúdo.",
      });
    }
  }
);

module.exports = router;
