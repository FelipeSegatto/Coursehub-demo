const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  listAdministrativeQueue,
  assignAdministrativeTicket,
} = require("../services/chat/chatAdministrativeSupportService");

const {
  listStaffQueue,
  openStaffConversation,
  assignStaffTicket,
} = require("../services/chat/chatStaffSupportService");

const { listReports, reviewReport } = require("../services/chat/chatModerationService");

const {
  getConversationForSupervisor,
  listMessagesForSupervisor,
  listAccessLogs,
} = require("../services/chat/chatAccessService");

const router = express.Router();

// Both ticket-style admin-queue modalities share the same assign
// route -- the conversation's own type decides which service handles
// the claim, so the client never has to know or supply it.
const ASSIGN_HANDLERS_BY_TYPE = {
  administrative_support: assignAdministrativeTicket,
  staff_support: assignStaffTicket,
};

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
 * GET /api/admin/chat/administrative-tickets
 * Admin-facing queue -- not scoped by chat_participants membership,
 * since an admin who hasn't claimed a ticket yet still needs to see
 * it exists. Any active role='admin' user sees the whole queue (no
 * category-level granular permission exists yet -- see the service's
 * own docstring for why that's deliberately deferred).
 */
router.get(
  "/admin/chat/administrative-tickets",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await listAdministrativeQueue(db, {
        category: req.query.category,
        status: req.query.status,
        unassignedOnly: req.query.unassignedOnly === "true",
        assignedToUserId: req.query.assignedToMe === "true" ? req.auth.userId : undefined,
        cursor: req.query.cursor,
        limit: req.query.limit,
      });

      return res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao buscar fila de atendimento.");
    }
  }
);

/**
 * GET /api/admin/chat/staff-tickets
 * Same shape as the administrative-tickets queue, for teacher <->
 * admin conversations instead of student <-> admin.
 */
router.get(
  "/admin/chat/staff-tickets",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await listStaffQueue(db, {
        category: req.query.category,
        status: req.query.status,
        unassignedOnly: req.query.unassignedOnly === "true",
        assignedToUserId: req.query.assignedToMe === "true" ? req.auth.userId : undefined,
        cursor: req.query.cursor,
        limit: req.query.limit,
      });

      return res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao buscar fila de atendimento a professores.");
    }
  }
);

/**
 * POST /api/admin/chat/staff-conversations
 * Admin-initiated half of staff_support -- the "bidirectional" side.
 * The admin picks a specific teacher; both are participants from
 * creation, self-assigned to the admin who opened it.
 */
router.post(
  "/admin/chat/staff-conversations",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await openStaffConversation(db, {
        adminUserId: req.auth.userId,
        teacherUserId: req.body.teacherUserId,
        category: req.body.category,
        subject: req.body.subject,
        body: req.body.body,
      });

      return res.status(201).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao iniciar conversa com o professor.");
    }
  }
);

/**
 * PATCH /api/admin/chat/conversations/:conversationId/assign
 * Claiming an unassigned ticket and reassigning an already-assigned
 * one are the same action -- the caller (the admin themself, from
 * the token, never a body param) becomes assigned_user_id. Shared by
 * every ticket-style admin-queue modality; the conversation's own
 * type (looked up here, never trusted from the client) picks which
 * service actually performs the claim.
 */
router.patch(
  "/admin/chat/conversations/:conversationId/assign",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const [typeRows] = await db
        .promise()
        .query("SELECT type FROM chat_conversations WHERE id = ? LIMIT 1", [req.params.conversationId]);

      const handler = ASSIGN_HANDLERS_BY_TYPE[typeRows[0]?.type];

      if (!handler) {
        return res.status(404).json({ message: "Protocolo não encontrado." });
      }

      const result = await handler(db, {
        conversationId: req.params.conversationId,
        adminUserId: req.auth.userId,
      });

      return res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao assumir atendimento.");
    }
  }
);

/**
 * GET /api/admin/chat/reports
 * Moderation queue -- open to any active admin (see the service's own
 * docstring for why report triage isn't gated by supervision
 * permission the way reading someone else's conversation is).
 */
router.get("/admin/chat/reports", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const result = await listReports(db, {
      status: req.query.status,
      cursor: req.query.cursor,
      limit: req.query.limit,
    });

    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error, "Erro ao buscar reports.");
  }
});

/**
 * PATCH /api/admin/chat/reports/:reportId
 * Resolve or dismiss -- reviewedByUserId always comes from the token.
 */
router.patch("/admin/chat/reports/:reportId", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const result = await reviewReport(db, {
      reportId: req.params.reportId,
      adminUserId: req.auth.userId,
      status: req.body.status,
      resolutionNote: req.body.resolutionNote,
    });

    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error, "Erro ao revisar report.");
  }
});

/**
 * GET /api/admin/chat/conversations/:conversationId/supervise
 * Extraordinary read access to a conversation the admin isn't a
 * participant of -- 403 (not 404) when the conversation exists but
 * the caller lacks the matching chat.supervise_* / chat.audit_access
 * permission, since that distinction is exactly what this stage needs
 * to be testable. Every successful call is logged to chat_access_logs
 * inside the service itself.
 */
router.get(
  "/admin/chat/conversations/:conversationId/supervise",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await getConversationForSupervisor(db, {
        conversationId: req.params.conversationId,
        adminUserId: req.auth.userId,
        accessReason: req.query.accessReason,
        details: req.query.details,
      });

      return res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao acessar conversa.");
    }
  }
);

/**
 * GET /api/admin/chat/conversations/:conversationId/supervise/messages
 * Same permission check as the route above, but doesn't write a new
 * access-log row per page -- the initial supervise call already did.
 */
router.get(
  "/admin/chat/conversations/:conversationId/supervise/messages",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await listMessagesForSupervisor(db, {
        conversationId: req.params.conversationId,
        adminUserId: req.auth.userId,
        cursor: req.query.cursor,
        limit: req.query.limit,
      });

      return res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao buscar mensagens.");
    }
  }
);

/**
 * GET /api/admin/chat/conversations/:conversationId/access-logs
 * Who accessed this conversation under extraordinary access, and why
 * -- the audit trail itself, readable by any admin (it's a record of
 * past access, not access to live conversation content).
 */
router.get(
  "/admin/chat/conversations/:conversationId/access-logs",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await listAccessLogs(db, {
        conversationId: req.params.conversationId,
        cursor: req.query.cursor,
        limit: req.query.limit,
      });

      return res.status(200).json(result);
    } catch (error) {
      return handleServiceError(res, error, "Erro ao buscar histórico de acesso.");
    }
  }
);

module.exports = router;
