const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");
const {
  chatMessageRateLimiter,
  chatConversationOpenRateLimiter,
  chatReportRateLimiter,
} = require("../middlewares/rateLimiters");

const {
  getConversationForUser,
  listConversationsForUser,
  getUnreadConversationCount,
  resolveConversation,
} = require("../services/chat/chatConversationService");

const {
  markConversationRead,
  archiveConversationForUser,
} = require("../services/chat/chatParticipantService");

const { createMessage, listMessages } = require("../services/chat/chatMessageService");

const {
  listAcademicContactContext,
  openAcademicPeerConversation,
} = require("../services/chat/chatAcademicPeerService");

const { ensureClassGroupsForStudent } = require("../services/chat/chatClassGroupService");

const {
  listEligibleTeachersForStudentCourse,
  openTeacherQuestion,
} = require(
  "../services/chat/chatTeacherSupportService"
);

const { openAdministrativeTicket } = require("../services/chat/chatAdministrativeSupportService");

const { openStaffTicket } = require("../services/chat/chatStaffSupportService");

const { reportMessage, deleteMessage } = require("../services/chat/chatModerationService");

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
 * GET /api/chat/conversations
 * Personal conversation list. userId always comes from the token --
 * never a query/body param.
 */
router.get("/chat/conversations", authenticateToken, async (req, res) => {
  try {
    if (req.auth.role === "student" && (!req.query.type || req.query.type === "academic_peer")) {
      try {
        await ensureClassGroupsForStudent(db, { userId: req.auth.userId });
      } catch (syncError) {
        console.error("[chat class group] falha ao sincronizar turmas:", syncError);
      }
    }

    const result = await listConversationsForUser(db, {
      userId: req.auth.userId,
      cursor: req.query.cursor,
      limit: req.query.limit,
      includeArchived: req.query.includeArchived === "true",
      type: req.query.type,
      status: req.query.status,
    });

    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error, "Erro ao buscar conversas.");
  }
});

/**
 * GET /api/chat/unread-count
 */
router.get("/chat/unread-count", authenticateToken, async (req, res) => {
  try {
    const result = await getUnreadConversationCount(db, { userId: req.auth.userId });

    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error, "Erro ao buscar contador de conversas.");
  }
});

/**
 * GET /api/chat/conversations/:conversationId
 * 404 (never 403) whether the id doesn't exist or the caller isn't a
 * participant -- knowing the id must never be enough to learn
 * anything about the conversation.
 */
router.get("/chat/conversations/:conversationId", authenticateToken, async (req, res) => {
  try {
    const result = await getConversationForUser(db, {
      conversationId: req.params.conversationId,
      userId: req.auth.userId,
    });

    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error, "Erro ao buscar conversa.");
  }
});

/**
 * GET /api/chat/conversations/:conversationId/messages
 * Cursor pagination by message id, never OFFSET.
 */
router.get("/chat/conversations/:conversationId/messages", authenticateToken, async (req, res) => {
  try {
    const result = await listMessages(db, {
      conversationId: req.params.conversationId,
      userId: req.auth.userId,
      cursor: req.query.cursor,
      limit: req.query.limit,
    });

    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error, "Erro ao buscar mensagens.");
  }
});

/**
 * POST /api/chat/conversations/:conversationId/messages
 * clientMessageId makes a repeated send idempotent -- the same id
 * from the same sender returns the already-created message instead
 * of duplicating it.
 */
router.post("/chat/conversations/:conversationId/messages", authenticateToken, chatMessageRateLimiter, async (req, res) => {
  try {
    const result = await createMessage(db, {
      conversationId: req.params.conversationId,
      userId: req.auth.userId,
      body: req.body.body,
      clientMessageId: req.body.clientMessageId,
      replyToMessageId: req.body.replyToMessageId,
    });

    return res.status(201).json(result);
  } catch (error) {
    return handleServiceError(res, error, "Erro ao enviar mensagem.");
  }
});

/**
 * PATCH /api/chat/conversations/:conversationId/read
 */
router.patch("/chat/conversations/:conversationId/read", authenticateToken, async (req, res) => {
  try {
    const result = await markConversationRead(db, {
      conversationId: req.params.conversationId,
      userId: req.auth.userId,
      lastReadMessageId: req.body.lastReadMessageId,
    });

    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error, "Erro ao marcar conversa como lida.");
  }
});

/**
 * PATCH /api/chat/conversations/:conversationId/archive
 */
router.patch("/chat/conversations/:conversationId/archive", authenticateToken, async (req, res) => {
  try {
    const result = await archiveConversationForUser(db, {
      conversationId: req.params.conversationId,
      userId: req.auth.userId,
    });

    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error, "Erro ao arquivar conversa.");
  }
});

/**
 * PATCH /api/chat/conversations/:conversationId/resolve
 * Any active participant -- student confirming their question was
 * answered counts just as much as the teacher marking it done.
 */
router.patch("/chat/conversations/:conversationId/resolve", authenticateToken, async (req, res) => {
  try {
    const result = await resolveConversation(db, {
      conversationId: req.params.conversationId,
      userId: req.auth.userId,
    });

    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error, "Erro ao resolver conversa.");
  }
});

/**
 * GET /api/chat/academic-contacts
 * Student-only: colleagues sharing an active enrollment with the
 * caller. Public academic identity only (name, avatar) -- never
 * email/phone/document.
 */
router.get("/chat/academic-contacts", authenticateToken, authorizeRoles("student"), async (req, res) => {
  try {
    const result = await listAcademicContactContext(db, {
      userId: req.auth.userId,
      search: req.query.search,
      classId: req.query.classId,
    });

    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error, "Erro ao buscar colegas.");
  }
});

/**
 * POST /api/chat/academic-conversations
 * Student-only. Idempotent: opening the same pair twice returns the
 * same conversation, never a duplicate or an error.
 */
router.post(
  "/chat/academic-conversations",
  authenticateToken,
  authorizeRoles("student"),
  chatConversationOpenRateLimiter,
  async (req, res) => {
    try {
      const result = await openAcademicPeerConversation(db, {
        userId: req.auth.userId,
        peerUserId: req.body.peerUserId,
      });

      return res.status(201).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao iniciar conversa.");
    }
  }
);


/**
 * ============================================================
 * GET /api/chat/teacher-contacts
 * ============================================================
 *
 * Lista os professores que o aluno autenticado
 * pode escolher para determinado curso.
 *
 *
 * Exemplo:
 *
 * GET /api/chat/teacher-contacts?courseId=10
 *
 *
 * Segurança:
 *
 * O backend confirma que o aluno possui
 * matrícula ativa no curso.
 */
router.get(
  "/chat/teacher-contacts",

  authenticateToken,

  authorizeRoles(
    "student"
  ),

  async (
    req,
    res
  ) => {

    try {

      const result =
        await listEligibleTeachersForStudentCourse(
          db,
          {
            userId:
              req.auth.userId,

            courseId:
              req.query.courseId,
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
        "Erro ao buscar professores disponíveis."
      );
    }
  }
);

/**
 * POST /api/chat/teacher-questions
 * Student-only. courseId/classId are validated server-side against
 * the caller's own active enrollment; the responsible teacher is
 * resolved from the course, never accepted from the client.
 */
router.post(
  "/chat/teacher-questions",
  authenticateToken,
  authorizeRoles("student"),
  chatConversationOpenRateLimiter,
  async (req, res) => {
    try {
      const result =
  await openTeacherQuestion(
    db,
    {
      userId:
        req.auth.userId,

      courseId:
        req.body.courseId,

      classId:
        req.body.classId,

      /**
       * NOVO:
       *
       * professor escolhido pelo aluno.
       */
      teacherId:
        req.body.teacherId,

      topic:
        req.body.topic,

      subject:
        req.body.subject,

      body:
        req.body.body,
    }
  );

      return res.status(201).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao abrir dúvida.");
    }
  }
);

/**
 * POST /api/chat/administrative-tickets
 * Student-only. Opens with only the student as participant -- no
 * admin is assigned yet; that's the separate claim/assign flow under
 * /api/admin/chat/*.
 */
router.post(
  "/chat/administrative-tickets",
  authenticateToken,
  authorizeRoles("student"),
  chatConversationOpenRateLimiter,
  async (req, res) => {
    try {
      const result = await openAdministrativeTicket(db, {
        userId: req.auth.userId,
        category: req.body.category,
        subject: req.body.subject,
        body: req.body.body,
      });

      return res.status(201).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao abrir protocolo.");
    }
  }
);

/**
 * POST /api/chat/staff-tickets
 * Teacher-only: the teacher-initiated half of staff_support. Opens
 * with only the teacher as participant, unassigned -- the same shape
 * as /chat/administrative-tickets, one modality over.
 */
router.post(
  "/chat/staff-tickets",
  authenticateToken,
  authorizeRoles("teacher"),
  chatConversationOpenRateLimiter,
  async (req, res) => {
    try {
      const result = await openStaffTicket(db, {
        userId: req.auth.userId,
        category: req.body.category,
        subject: req.body.subject,
        body: req.body.body,
      });

      return res.status(201).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao abrir protocolo.");
    }
  }
);

/**
 * POST /api/chat/messages/:messageId/report
 * Any authenticated participant of the message's own conversation --
 * assertParticipant inside reportMessage is the actual gate.
 */
router.post(
  "/chat/messages/:messageId/report",
  authenticateToken,
  chatReportRateLimiter,
  async (req, res) => {
    try {
      const result = await reportMessage(db, {
        messageId: req.params.messageId,
        reporterUserId: req.auth.userId,
        reason: req.body.reason,
        details: req.body.details,
      });

      return res.status(201).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao reportar mensagem.");
    }
  }
);

/**
 * DELETE /api/chat/messages/:messageId
 * Soft-delete: the sender removing their own message, or an admin
 * with the matching supervision permission for that conversation's
 * type -- deleteMessage itself decides which case applies.
 */
router.delete("/chat/messages/:messageId", authenticateToken, async (req, res) => {
  try {
    const result = await deleteMessage(db, {
      messageId: req.params.messageId,
      userId: req.auth.userId,
    });

    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error, "Erro ao remover mensagem.");
  }
});

module.exports = router;
