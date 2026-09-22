function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

/**
 * Etapa 12's only consumers. New stages add their own keys here as
 * they need them (financial.audit, academic.audit, etc.) -- kept as
 * an explicit allowlist rather than a free-form string accepted from
 * the client, since granting a permission is a real authorization
 * change, not user-facing content.
 */
const VALID_PERMISSION_KEYS = [
  "chat.supervise_teacher_support",
  "chat.supervise_administrative_support",
  "chat.supervise_staff_support",
  "chat.audit_access",
];

/**
 * `runner` can be the pool (db.promise()) or an open connection
 * inside a transaction, same convention as classAccessService.
 * revoked_at IS NULL is the "currently active" filter -- there is no
 * DB-level partial unique index for this (see the migration's own
 * comment), so every read of "does this admin have X" goes through
 * this same check.
 */
async function hasPermission(runner, { userId, permissionKey }) {
  const [rows] = await runner.query(
    `SELECT id FROM admin_permissions WHERE user_id = ? AND permission_key = ? AND revoked_at IS NULL LIMIT 1`,
    [userId, permissionKey]
  );

  return rows.length > 0;
}

async function listPermissionsForUser(db, { userId }) {
  const [rows] = await db.promise().query(
    `
      SELECT ap.id, ap.permission_key, ap.granted_by_user_id, ap.granted_at, granter.name AS granted_by_name
      FROM admin_permissions ap
      LEFT JOIN users granter ON granter.id = ap.granted_by_user_id
      WHERE ap.user_id = ? AND ap.revoked_at IS NULL
      ORDER BY ap.permission_key ASC
    `,
    [userId]
  );

  return rows.map((row) => ({
    id: row.id,
    permissionKey: row.permission_key,
    grantedByUserId: row.granted_by_user_id,
    grantedByName: row.granted_by_name,
    grantedAt: row.granted_at,
  }));
}

/**
 * Idempotent on an already-active grant -- granting the same
 * permission twice is a no-op, not an error or a duplicate row.
 * Only ever targets a real admin account; granting a permission to a
 * student/teacher account would be meaningless (every check site here
 * is admin-only anyway) and is rejected as a data-entry mistake.
 */
async function grantPermission(db, { userId, permissionKey, grantedByUserId }) {
  if (!VALID_PERMISSION_KEYS.includes(permissionKey)) {
    throw createServiceError(`Permissão inválida. Use uma de: ${VALID_PERMISSION_KEYS.join(", ")}.`, 400);
  }

  const runner = db.promise();

  const [userRows] = await runner.query(`SELECT id, role FROM users WHERE id = ? LIMIT 1`, [userId]);

  if (userRows.length === 0) {
    throw createServiceError("Usuário não encontrado.", 404);
  }

  if (userRows[0].role !== "admin") {
    throw createServiceError("Esta permissão só pode ser concedida a uma conta de administrador.", 400);
  }

  const alreadyGranted = await hasPermission(runner, { userId, permissionKey });

  if (alreadyGranted) {
    return { granted: true, alreadyGranted: true };
  }

  await runner.query(
    `INSERT INTO admin_permissions (user_id, permission_key, granted_by_user_id, granted_at) VALUES (?, ?, ?, NOW())`,
    [userId, permissionKey, grantedByUserId]
  );

  return { granted: true, alreadyGranted: false };
}

/**
 * Idempotent the other way too -- revoking a permission that isn't
 * currently active (never granted, or already revoked) is a silent
 * no-op (revoked: false), not an error.
 */
async function revokePermission(db, { userId, permissionKey }) {
  const [result] = await db
    .promise()
    .query(
      `UPDATE admin_permissions SET revoked_at = NOW(), updated_at = NOW() WHERE user_id = ? AND permission_key = ? AND revoked_at IS NULL`,
      [userId, permissionKey]
    );

  return { revoked: result.affectedRows > 0 };
}

module.exports = {
  createServiceError,
  VALID_PERMISSION_KEYS,
  hasPermission,
  listPermissionsForUser,
  grantPermission,
  revokePermission,
};
