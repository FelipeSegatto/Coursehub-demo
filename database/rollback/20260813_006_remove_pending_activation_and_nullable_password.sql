-- =========================================================
-- Rollback: remove pending_activation status, restore NOT NULL password_hash
-- Related migration:
-- 20260813_006_add_pending_activation_and_nullable_password.sql
-- =========================================================
--
-- Warning:
-- If any user is currently 'pending_activation' or has a NULL
-- password_hash, this rollback will FAIL (or produce an invalid
-- state) until those rows are resolved (activate the account or set
-- a status this schema still accepts). Check before running:
--   SELECT id, email, status FROM users
--   WHERE status = 'pending_activation' OR password_hash IS NULL;
-- =========================================================

USE coursehub_escola;

ALTER TABLE users
  MODIFY COLUMN status ENUM('active', 'inactive', 'blocked')
    NOT NULL DEFAULT 'active',
  MODIFY COLUMN password_hash VARCHAR(255) NOT NULL;
