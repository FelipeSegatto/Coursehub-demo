-- CourseHub
-- Migration: add pending_activation user status, make password_hash nullable
-- Date: 2026-08-13
-- Feature: administrative contracting flow -- account activation
-- MySQL: 8.0+
--
-- Purpose:
--   A student created through the admin contracting flow (new
--   student, contract still awaiting payment) must not have a
--   password generated or emailed -- they set their own password
--   only after payment is confirmed and their enrollment is created,
--   via the account-activation flow (account_activation_tokens).
--   Until then, the account is neither 'active' nor 'inactive'/
--   'blocked' -- it's a distinct 'pending_activation' state that
--   authService.login already rejects today via its existing
--   `status !== 'active'` gate, so no login-logic change is required
--   by this migration alone (see the accompanying service change for
--   the explicit "reject missing password_hash" guard).
--
-- Compatibility:
--   password_hash becoming nullable does not affect any existing row
--   (every current user already has a real hash). No existing value
--   is altered by this migration.
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   MySQL DDL statements perform implicit commits, so run this only
--   after a backup.

USE coursehub_escola;

ALTER TABLE users
  MODIFY COLUMN password_hash VARCHAR(255) NULL,
  MODIFY COLUMN status ENUM('active', 'inactive', 'blocked', 'pending_activation')
    NOT NULL DEFAULT 'active';

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'users' AS table_name, COUNT(*) AS row_count FROM users;
