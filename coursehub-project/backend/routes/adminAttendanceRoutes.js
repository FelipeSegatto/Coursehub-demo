const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  listAttendance,
  getAttendanceById,
  adjustAttendance,
} = require("../services/admin/adminAttendanceService");

const {
  listAttendanceSessions,
  getAttendanceSessionDetail,
} = require("../services/admin/adminAttendanceSessionService");

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
 * GET /api/admin/attendance
 */
router.get(
  "/admin/attendance",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await listAttendance(db, req.query);

      return res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao buscar frequência.");
    }
  }
);

/**
 * GET /api/admin/attendance/sessions
 * Frequência por chamada -- a unidade é o encontro, não o registro
 * individual. Precisa vir ANTES de /admin/attendance/:attendanceId
 * na ordem de registro, senão o Express tentaria casar "sessions"
 * como um :attendanceId.
 */
router.get(
  "/admin/attendance/sessions",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await listAttendanceSessions(db, req.query);

      return res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao buscar chamadas de frequência.");
    }
  }
);

/**
 * GET /api/admin/attendance/sessions/:sessionId
 */
router.get(
  "/admin/attendance/sessions/:sessionId",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await getAttendanceSessionDetail(db, req.params.sessionId);

      return res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao buscar detalhe da chamada.");
    }
  }
);

/**
 * GET /api/admin/attendance/:attendanceId
 */
router.get(
  "/admin/attendance/:attendanceId",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const attendance = await getAttendanceById(db, req.params.attendanceId);

      return res.status(200).json(attendance);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao buscar registro de frequência.");
    }
  }
);

/**
 * PATCH /api/admin/attendance/:attendanceId/adjust
 */
router.patch(
  "/admin/attendance/:attendanceId/adjust",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const attendance = await adjustAttendance(
        db,
        req.params.attendanceId,
        { status: req.body.status, reason: req.body.reason },
        req.auth.userId
      );

      return res.status(200).json({
        message: "Frequência ajustada com sucesso.",
        attendance,
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro ao ajustar frequência.");
    }
  }
);

module.exports = router;
