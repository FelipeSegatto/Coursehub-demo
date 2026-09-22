-- Seed chat supervision permissions for every active admin.
-- Idempotent: skips keys that already have an active grant.

USE coursehub_escola;

INSERT INTO admin_permissions (user_id, permission_key, granted_by_user_id, granted_at)
SELECT u.id, perm_keys.permission_key, u.id, NOW()
FROM users u
CROSS JOIN (
  SELECT 'chat.supervise_teacher_support' AS permission_key
  UNION ALL SELECT 'chat.supervise_administrative_support'
  UNION ALL SELECT 'chat.supervise_staff_support'
  UNION ALL SELECT 'chat.audit_access'
) AS perm_keys
WHERE u.role = 'admin'
  AND u.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM admin_permissions ap
    WHERE ap.user_id = u.id
      AND ap.permission_key = perm_keys.permission_key
      AND ap.revoked_at IS NULL
  );
