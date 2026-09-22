const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  createEvent,
  updateEvent,
  cancelEvent,
  listCalendarForAdmin,
} = require("../services/calendar/adminCalendarEventService");

const router = express.Router();

/**
 * GET /api/admin/calendar/events
 */
router.get(
  "/events",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await listCalendarForAdmin(db, {
        from: req.query.from,
        to: req.query.to,
        courseId: req.query.courseId,
        classId: req.query.classId,
        scopeType: req.query.scopeType,
        status: req.query.status,
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error("Erro ao buscar calendário administrativo:", error);

      return res.status(error.statusCode || 500).json({
        message: error.message || "Erro ao buscar calendário.",
      });
    }
  }
);

/**
 * POST /api/admin/calendar/events
 */
router.post(
  "/events",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await createEvent(db, {
        userId: req.auth.userId,
        payload: req.body,
      });

      return res.status(201).json(result);
    } catch (error) {
      console.error("Erro ao criar evento do calendário:", error);

      return res.status(error.statusCode || 500).json({
        message: error.message || "Erro ao criar evento.",
      });
    }
  }
);

/**
 * PUT /api/admin/calendar/events/:id
 */
router.put(
  "/events/:id",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await updateEvent(db, {
        id: req.params.id,
        payload: req.body,
      });

      return res.status(200).json(result);
    } catch (error) {
      console.error("Erro ao atualizar evento do calendário:", error);

      return res.status(error.statusCode || 500).json({
        message: error.message || "Erro ao atualizar evento.",
      });
    }
  }
);

/**
 * DELETE /api/admin/calendar/events/:id
 * Soft cancel — nunca remove a linha do banco.
 */
router.delete(
  "/events/:id",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await cancelEvent(db, { id: req.params.id });

      return res.status(200).json(result);
    } catch (error) {
      console.error("Erro ao cancelar evento do calendário:", error);

      return res.status(error.statusCode || 500).json({
        message: error.message || "Erro ao cancelar evento.",
      });
    }
  }
);

module.exports = router;
