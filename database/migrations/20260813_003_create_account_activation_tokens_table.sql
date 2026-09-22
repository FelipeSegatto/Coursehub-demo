-- CourseHub
-- Migration: create account_activation_tokens
-- Date: 2026-08-13
-- Feature: administrative contracting flow -- account activation
--          (semantically distinct from password recovery)
-- MySQL: 8.0+
--
-- Purpose:
--   A new user created through the admin contracting flow starts as
--   users.status = 'pending_activation' with no password set. This
--   table backs the "activate your account" flow that lets that user
--   set their first password -- reusing the same opaque-token
--   generation/hashing helpers as password_reset_tokens
--   (utils/tokens.js) but as its own table/flow, since activation and
--   password recovery are different operations with different
--   preconditions (activation requires a paid invoice + active
--   enrollment; recovery requires an already-active account).
--
-- Domain rules:
--   - Single-use: used_at is set the moment the token is consumed,
--     never reused afterwards.
--   - invalidated_at: unlike password_reset_tokens, this flow
--     explicitly invalidates prior still-valid tokens whenever a new
--     one is issued (resend, or admin-generated manual link) -- only
--     ever one usable token per user at a time. A token counts as
--     "usable" only when both used_at AND invalidated_at are NULL and
--     expires_at is in the future.
--   - The raw token itself is NEVER stored -- only its SHA-256 hash
--     (token_hash), mirroring password_reset_tokens/refresh_tokens.
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   MySQL DDL statements perform implicit commits, so run this only
--   after a backup.

USE coursehub_escola;

CREATE TABLE account_activation_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL,

  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  invalidated_at DATETIME NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  UNIQUE KEY uq_account_activation_tokens_hash (token_hash),
  KEY idx_account_activation_tokens_user (user_id),
  KEY idx_account_activation_tokens_lookup (user_id, used_at, invalidated_at, expires_at),

  CONSTRAINT fk_account_activation_tokens_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'account_activation_tokens' AS table_name, COUNT(*) AS row_count FROM account_activation_tokens;
