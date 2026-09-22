-- CourseHub
-- Migration: create invoice_payment_sessions
-- Date: 2026-08-14
-- Feature: multi-channel checkout -- private invoice payment link
-- MySQL: 8.0+
--
-- Purpose:
--   Backs the token-to-session exchange described for the private
--   invoice payment link: the raw token from
--   invoice_payment_access_tokens is only ever sent to the backend
--   once, in the body of POST /api/public/invoice-payment/session.
--   That endpoint exchanges it for a short-lived, DB-backed session
--   bound to an HTTP-only cookie -- the frontend then scrubs the
--   token from the address bar. This mirrors the existing
--   refresh_tokens / account_activation_tokens pattern (opaque
--   token + SHA-256 hash + httpOnly cookie), not a new
--   stateless/signed-cookie scheme: real revocation
--   (invoice_payment_sessions.revoked_at) requires a DB row, which a
--   signed cookie alone cannot provide.
--
-- Domain rules:
--   - The raw session token is NEVER stored -- only its SHA-256 hash
--     (session_token_hash), same discipline as every other token
--     table in this project.
--   - invoice_id is denormalized here (also reachable via
--     invoice_payment_access_token_id) purely so every request on the
--     hot path (checking cookie validity) is a single-table lookup,
--     without an extra join through the access-token table.
--   - Short TTL (see backend/config/checkoutConfig.js,
--     INVOICE_PAYMENT_SESSION_TTL_MINUTES, default 45) independent of
--     the parent access token's own (much longer) expiry.
--   - A session already established before its invoice reaches a
--     terminal status (paid/cancelled/refunded) is intentionally NOT
--     revoked when that happens -- the payer mid-flow must still see
--     the accurate final outcome for the payment they may have just
--     completed. Only invoice_payment_access_tokens.invalidated_at
--     blocks *new* token-to-session exchanges after that point.
--   - ON DELETE CASCADE from the parent access token: invalidating or
--     removing the token invalidates every session it ever produced.
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   Requires a DB user with DDL privileges (CREATE).
--   Must run AFTER 20260814_002_create_invoice_payment_access_tokens_table.sql
--   (FK dependency).

USE coursehub_escola;

CREATE TABLE invoice_payment_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  invoice_payment_access_token_id BIGINT UNSIGNED NOT NULL,
  invoice_id INT NOT NULL,
  session_token_hash CHAR(64) NOT NULL,

  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  last_accessed_at DATETIME NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  UNIQUE KEY uq_invoice_payment_sessions_hash (session_token_hash),
  KEY idx_invoice_payment_sessions_invoice (invoice_id),
  KEY idx_invoice_payment_sessions_token_owner (invoice_payment_access_token_id),

  CONSTRAINT fk_invoice_payment_sessions_token
    FOREIGN KEY (invoice_payment_access_token_id)
    REFERENCES invoice_payment_access_tokens(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_invoice_payment_sessions_invoice
    FOREIGN KEY (invoice_id)
    REFERENCES invoices(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'invoice_payment_sessions' AS table_name, COUNT(*) AS row_count FROM invoice_payment_sessions;
