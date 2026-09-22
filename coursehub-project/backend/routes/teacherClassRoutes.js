const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");
const { getTeacherIdByUserId, getClassOwnedByTeacher, createServiceError } = require("../services/classes/classAccessService");
const { createConversation } = require("../services/chat/chatConversationService");

const {
  listClasses,
  getClassDetail,
  listClassStudents,
  listClassActivities,
} = require("../services/teacher/teacherClassService");

const router = express.Router();

function handleServiceError(res, error, fallbackMessage) {
  console.error(fallbackMessage, error);

  return res.status(error.statusCode || 500).json({
    message: error.statusCode ? error.message : fallbackMessage,
    error: error.statusCode ? undefined : error.message,
    sqlMessage: error.statusCode ? undefined : error.sqlMessage,
    code: error.statusCode ? undefined : error.code,
  });
}

/**
 * GET /api/teacher/by-user/:userId/classes
 */
router.get(
  "/teacher/by-user/:userId/classes",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const result = await listClasses(db, {
        userId: req.auth.userId,
        status: req.query.status,
      });

      return res.status(200).json(result);
    } catch (error) {
      return handleServiceError(
        res,
        error,
        "Erro interno ao buscar turmas do professor."
      );
    }
  }
);

/**
 * GET /api/teacher/by-user/:userId/classes/:classId
 */
router.get(
  "/teacher/by-user/:userId/classes/:classId",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const result = await getClassDetail(db, {
        userId: req.auth.userId,
        classId: Number(req.params.classId),
      });

      return res.status(200).json(result);
    } catch (error) {
      return handleServiceError(
        res,
        error,
        "Erro interno ao buscar os dados da turma."
      );
    }
  }
);

/**
 * GET /api/teacher/by-user/:userId/classes/:classId/students
 */
router.get(
  "/teacher/by-user/:userId/classes/:classId/students",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const result = await listClassStudents(db, {
        userId: req.auth.userId,
        classId: Number(req.params.classId),
      });

      return res.status(200).json(result);
    } catch (error) {
      return handleServiceError(
        res,
        error,
        "Erro interno ao buscar os alunos da turma."
      );
    }
  }
);


/**
 * POST /api/teacher/by-user/:userId/classes/:classId/students/:studentUserId/chat
 * Abre (ou reaproveita) uma conversa individual entre o professor
 * autenticado e um aluno pertencente à turma.
 */
router.post(
  "/teacher/by-user/:userId/classes/:classId/students/:studentUserId/chat",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const classId = Number(req.params.classId);
      const studentUserId = Number(req.params.studentUserId);
      const teacherUserId = Number(req.auth.userId);

      if (!Number.isInteger(classId) || classId <= 0 || !Number.isInteger(studentUserId) || studentUserId <= 0) {
        throw createServiceError("Turma ou aluno inválido.", 400);
      }

      const runner = db.promise();
      const teacherId = await getTeacherIdByUserId(runner, teacherUserId);
      const classData = teacherId
        ? await getClassOwnedByTeacher(runner, { classId, teacherId })
        : null;

      if (!classData) {
        throw createServiceError("Turma não encontrada ou não vinculada ao professor.", 404);
      }

      const [studentRows] = await runner.query(
        `SELECT u.id AS user_id, u.name, s.id AS student_id
           FROM enrollments e
           INNER JOIN students s ON s.id = e.student_id
           INNER JOIN users u ON u.id = s.user_id
          WHERE e.class_id = ? AND u.id = ?
          LIMIT 1`,
        [classId, studentUserId]
      );

      const student = studentRows[0];
      if (!student) {
        throw createServiceError("Aluno não pertence a esta turma.", 404);
      }

      const [existingRows] = await runner.query(
        `SELECT c.id
           FROM chat_conversations c
           INNER JOIN chat_participants pt ON pt.conversation_id = c.id AND pt.user_id = ? AND pt.left_at IS NULL
           INNER JOIN chat_participants ps ON ps.conversation_id = c.id AND ps.user_id = ? AND ps.left_at IS NULL
          WHERE c.type = 'teacher_support'
            AND c.class_id = ?
          ORDER BY c.updated_at DESC, c.id DESC
          LIMIT 1`,
        [teacherUserId, studentUserId, classId]
      );

      if (existingRows[0]) {
        return res.status(200).json({
          conversationId: existingRows[0].id,
          created: false,
          student: { userId: student.user_id, studentId: student.student_id, name: student.name },
        });
      }

      const created = await createConversation(db, {
        type: "teacher_support",
        channelKind: "ticket",
        title: `Conversa com ${student.name}`,
        category: "general",
        courseId: classData.course_id,
        classId,
        createdByUserId: teacherUserId,
        initiatorRole: "teacher",
        initialStatus: "waiting_student",
        participants: [
          { userId: teacherUserId, participantRole: "teacher" },
          { userId: studentUserId, participantRole: "student" },
        ],
      });

      return res.status(201).json({
        conversationId: created.conversationId,
        created: true,
        student: { userId: student.user_id, studentId: student.student_id, name: student.name },
      });
    } catch (error) {
      return handleServiceError(res, error, "Erro interno ao abrir conversa com o aluno.");
    }
  }
);

/**
 * GET /api/teacher/by-user/:userId/classes/:classId/activities
 */
router.get(
  "/teacher/by-user/:userId/classes/:classId/activities",
  authenticateToken,
  authorizeRoles("teacher"),
  async (req, res) => {
    try {
      const result = await listClassActivities(db, {
        userId: req.auth.userId,
        classId: Number(req.params.classId),
        activityKind: req.query.activityKind,
        status: req.query.status,
      });

      return res.status(200).json(result);
    } catch (error) {
      return handleServiceError(
        res,
        error,
        "Erro interno ao buscar as atividades da turma."
      );
    }
  }
);

module.exports = router;
