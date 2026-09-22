const express = require("express");
const db = require("../db");
const authenticateToken = require("../middlewares/authenticateToken");
const authorizeRoles = require("../middlewares/authorizeRoles");

const {
  VALID_PERMISSION_KEYS,
  listPermissionsForUser,
  grantPermission,
  revokePermission,
} = require("../services/admin/adminPermissionService");

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
 * GET /api/admin/permissions/keys
 * The allowlist itself, so the frontend never hardcodes it.
 */
router.get("/admin/permissions/keys", authenticateToken, authorizeRoles("admin"), (req, res) => {
  return res.status(200).json({ keys: VALID_PERMISSION_KEYS });
});

/**
 * GET /api/admin/permissions/:userId
 * Currently active grants for one admin.
 */
router.get("/admin/permissions/:userId", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const result = await listPermissionsForUser(db, { userId: req.params.userId });

    return res.status(200).json({ items: result });
  } catch (error) {
    return handleServiceError(res, error, "Erro ao buscar permissões.");
  }
});

/**
 * POST /api/admin/permissions
 * grantedByUserId always comes from the token, never the body --
 * who granted a permission is itself part of the audit trail.
 */
router.post("/admin/permissions", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const result = await grantPermission(db, {
      userId: req.body.userId,
      permissionKey: req.body.permissionKey,
      grantedByUserId: req.auth.userId,
    });

    return res.status(201).json(result);
  } catch (error) {
    return handleServiceError(res, error, "Erro ao conceder permissão.");
  }
});

/**
 * DELETE /api/admin/permissions
 * Body-based (userId + permissionKey), not a resource path segment --
 * there's no single-resource id here, only the (user, key) pair.
 */
router.delete("/admin/permissions", authenticateToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const result = await revokePermission(db, {
      userId: req.body.userId,
      permissionKey: req.body.permissionKey,
    });

    return res.status(200).json(result);
  } catch (error) {
    return handleServiceError(res, error, "Erro ao revogar permissão.");
  }
});

module.exports = router;
