const express = require("express");
const db = require("../db");

const {
  listCourses,
  getCourseById,
  getActivePricingPlans,
} = require("../services/public/publicCourseService");

const {
  getPublicCourseContents,
} = require("../services/courseContents/studentCourseContentService");

const router = express.Router();

/**
 * GET /api/courses
 * Lista todos os cursos cadastrados.
 */
router.get("/courses", async (req, res) => {
  try {
    const courses = await listCourses(db);

    return res.status(200).json(courses);
  } catch (error) {
    console.error("Erro ao buscar cursos:", error);

    return res.status(500).json({ message: "Erro ao buscar cursos." });
  }
});

/**
 * GET /api/courses/:id
 * Busca os detalhes de um curso pelo ID.
 */
router.get("/courses/:id", async (req, res) => {
  try {
    const course = await getCourseById(db, req.params.id);

    return res.status(200).json(course);
  } catch (error) {
    console.error("Erro ao buscar curso:", error);

    return res.status(error.statusCode || 500).json({
      message: error.statusCode
        ? error.message
        : "Erro interno ao buscar o curso.",
    });
  }
});

/**
 * GET /api/courses/:id/pricing-plans
 * Lista os planos comerciais ATIVOS de um curso -- só campos
 * seguros para exibição pública (sem status/timestamps internos).
 */
router.get("/courses/:id/pricing-plans", async (req, res) => {
  try {
    const plans = await getActivePricingPlans(db, req.params.id);

    return res.status(200).json(plans);
  } catch (error) {
    console.error("Erro ao buscar planos de preço do curso:", error);

    return res.status(error.statusCode || 500).json({
      message: error.statusCode
        ? error.message
        : "Erro ao buscar planos de preço do curso.",
    });
  }
});

/**
 * GET /api/courses/:id/contents
 * Lista os conteúdos GERAIS (class_id NULL) de um curso.
 *
 * Rota pública — nunca deve expor conteúdo exclusivo de turma.
 * Alunos autenticados que precisam ver também o conteúdo da própria
 * turma devem usar GET /api/students/courses/:courseId/contents.
 */
router.get("/courses/:id/contents", async (req, res) => {
  try {
    const contents = await getPublicCourseContents(db, req.params.id);

    return res.status(200).json(contents);
  } catch (error) {
    console.error("Erro ao buscar conteúdos do curso:", error);

    return res.status(error.statusCode || 500).json({
      message: error.message || "Erro ao buscar conteúdos do curso.",
    });
  }
});

module.exports = router;
