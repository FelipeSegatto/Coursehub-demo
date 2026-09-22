const { test, after } = require("node:test");
const assert = require("node:assert/strict");

require("dotenv").config();

const db = require("../../db");
const {
  hasPermission,
  listPermissionsForUser,
  grantPermission,
  revokePermission,
} = require("../../services/admin/adminPermissionService");

// Real, pre-existing accounts (read-only -- nothing about them is
// created or mutated, only admin_permissions rows, fully cleaned up
// in after()). 42/43 are real admins (Felipe Segatto, Larissa
// Almeida); 19 is a real teacher (not an admin), used for the
// reject-non-admin-grantee test.
const ADMIN_A_USER_ID = 42;
const ADMIN_B_USER_ID = 43;
const TEACHER_USER_ID = 19;

const PERMISSION_KEY = "chat.supervise_teacher_support";

after(async () => {
  await db
    .promise()
    .query(
      `DELETE FROM admin_permissions WHERE user_id IN (?, ?, ?) AND permission_key IN ('chat.supervise_teacher_support', 'chat.audit_access', 'not_a_real_key')`,
      [ADMIN_A_USER_ID, ADMIN_B_USER_ID, TEACHER_USER_ID]
    );

  await db.promise().end();
});

test("grantPermission grants a valid key to a real admin", async () => {
  const result = await grantPermission(db, {
    userId: ADMIN_A_USER_ID,
    permissionKey: PERMISSION_KEY,
    grantedByUserId: ADMIN_B_USER_ID,
  });

  assert.equal(result.granted, true);
  assert.equal(result.alreadyGranted, false);

  const active = await hasPermission(db.promise(), { userId: ADMIN_A_USER_ID, permissionKey: PERMISSION_KEY });

  assert.equal(active, true);
});

test("grantPermission is idempotent on an already-active grant", async () => {
  await grantPermission(db, { userId: ADMIN_A_USER_ID, permissionKey: PERMISSION_KEY, grantedByUserId: ADMIN_B_USER_ID });

  const second = await grantPermission(db, {
    userId: ADMIN_A_USER_ID,
    permissionKey: PERMISSION_KEY,
    grantedByUserId: ADMIN_B_USER_ID,
  });

  assert.equal(second.granted, true);
  assert.equal(second.alreadyGranted, true);

  const [rows] = await db
    .promise()
    .query(`SELECT COUNT(*) AS total FROM admin_permissions WHERE user_id = ? AND permission_key = ?`, [
      ADMIN_A_USER_ID,
      PERMISSION_KEY,
    ]);

  assert.equal(rows[0].total, 1);
});

test("grantPermission rejects an invalid permission key", async () => {
  await assert.rejects(
    () =>
      grantPermission(db, {
        userId: ADMIN_A_USER_ID,
        permissionKey: "not_a_real_key",
        grantedByUserId: ADMIN_B_USER_ID,
      }),
    (error) => error.statusCode === 400
  );
});

test("grantPermission rejects a grantee that isn't an admin account", async () => {
  await assert.rejects(
    () =>
      grantPermission(db, {
        userId: TEACHER_USER_ID,
        permissionKey: PERMISSION_KEY,
        grantedByUserId: ADMIN_B_USER_ID,
      }),
    (error) => error.statusCode === 400
  );
});

test("revokePermission deactivates an active grant", async () => {
  await grantPermission(db, { userId: ADMIN_A_USER_ID, permissionKey: PERMISSION_KEY, grantedByUserId: ADMIN_B_USER_ID });

  const result = await revokePermission(db, { userId: ADMIN_A_USER_ID, permissionKey: PERMISSION_KEY });

  assert.equal(result.revoked, true);

  const active = await hasPermission(db.promise(), { userId: ADMIN_A_USER_ID, permissionKey: PERMISSION_KEY });

  assert.equal(active, false);
});

test("revokePermission is a silent no-op when nothing is currently active", async () => {
  const result = await revokePermission(db, { userId: ADMIN_A_USER_ID, permissionKey: PERMISSION_KEY });

  assert.equal(result.revoked, false);
});

test("a permission can be re-granted after being revoked", async () => {
  await grantPermission(db, { userId: ADMIN_A_USER_ID, permissionKey: PERMISSION_KEY, grantedByUserId: ADMIN_B_USER_ID });
  await revokePermission(db, { userId: ADMIN_A_USER_ID, permissionKey: PERMISSION_KEY });

  const regrant = await grantPermission(db, {
    userId: ADMIN_A_USER_ID,
    permissionKey: PERMISSION_KEY,
    grantedByUserId: ADMIN_B_USER_ID,
  });

  assert.equal(regrant.granted, true);
  assert.equal(regrant.alreadyGranted, false);

  const active = await hasPermission(db.promise(), { userId: ADMIN_A_USER_ID, permissionKey: PERMISSION_KEY });

  assert.equal(active, true);
});

test("listPermissionsForUser returns only currently active grants", async () => {
  await grantPermission(db, { userId: ADMIN_A_USER_ID, permissionKey: PERMISSION_KEY, grantedByUserId: ADMIN_B_USER_ID });
  await grantPermission(db, {
    userId: ADMIN_A_USER_ID,
    permissionKey: "chat.audit_access",
    grantedByUserId: ADMIN_B_USER_ID,
  });
  await revokePermission(db, { userId: ADMIN_A_USER_ID, permissionKey: "chat.audit_access" });

  const result = await listPermissionsForUser(db, { userId: ADMIN_A_USER_ID });
  const keys = result.map((item) => item.permissionKey);

  assert.ok(keys.includes(PERMISSION_KEY));
  assert.equal(keys.includes("chat.audit_access"), false);
});
