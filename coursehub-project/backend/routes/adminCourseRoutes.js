const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  listCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse,
  listActivePricingPlansByCourse,
} = require("../services/admin/adminCourseService");

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
 * GET /api/admin/courses
 */
router.get(
  "/admin/courses",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const courses = await listCourses(db);

      return res.status(200).json(courses);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao buscar cursos.");
    }
  }
);

/**
 * GET /api/admin/courses/:id
 */
router.get(
  "/admin/courses/:id",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const course = await getCourseById(db, req.params.id);

      return res.status(200).json(course);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao buscar os dados do curso.");
    }
  }
);

/**
 * POST /api/admin/courses
 */
router.post(
  "/admin/courses",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const course = await createCourse(db, req.body);

      return res.status(201).json({
        message: "Curso criado com sucesso.",
        course,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao criar curso.");
    }
  }
);

/**
 * PUT /api/admin/courses/:id
 */
router.put(
  "/admin/courses/:id",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const course = await updateCourse(db, req.params.id, req.body);

      return res.status(200).json({
        message: "Curso atualizado com sucesso.",
        course,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao atualizar curso.");
    }
  }
);

/**
 * DELETE /api/admin/courses/:id
 * Soft delete — arquiva o curso sem removê-lo do banco.
 */
router.delete(
  "/admin/courses/:id",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const course = await deleteCourse(db, req.params.id);

      return res.status(200).json({
        message: "Curso arquivado com sucesso.",
        course,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao arquivar curso.");
    }
  }
);

/**
 * GET /api/admin/courses/:id/pricing-plans
 */
router.get(
  "/admin/courses/:id/pricing-plans",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const plans = await listActivePricingPlansByCourse(db, req.params.id);

      return res.status(200).json(plans);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao buscar planos de preço do curso.");
    }
  }
);

module.exports = router;
