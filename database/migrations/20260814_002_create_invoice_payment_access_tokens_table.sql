-- CourseHub
-- Migration: create invoice_payment_access_tokens
-- Date: 2026-08-14
-- Feature: multi-channel checkout -- private invoice payment link
-- MySQL: 8.0+
--
-- Purpose:
--   Backs the secure "/pagamento/fatura?token=..." link a contracting
--   party (with or without a CourseHub account) can open to pay a
--   single specific invoice, without logging in. Clones the
--   opaque-token/hash-only pattern of account_activation_tokens
--   (utils/tokens.js: generateOpaqueToken/hashToken), but anchored on
--   invoice_id instead of user_id, since a payer here is not
--   necessarily a CourseHub user.
--
-- Domain rules:
--   - The raw token is NEVER stored -- only its SHA-256 hash
--     (token_hash), same as account_activation_tokens/refresh_tokens.
--   - Unlike account_activation_tokens, there is no used_at: opening
--     the link (viewing the invoice) never consumes the token -- only
--     invalidated_at/expires_at determine usability. "Usable" =
--     invalidated_at IS NULL AND expires_at > NOW().
--   - Issuing a new token for the same invoice (admin regenerates the
--     link) explicitly invalidates every previously usable token for
--     that invoice -- only one usable link at a time, mirroring
--     account_activation_tokens' single-valid-link behavior.
--   - recipient_name_snapshot/recipient_email_snapshot freeze who the
--     link was generated for at issue time, independent of whether
--     financial_contracts.contracting_party_* later changes.
--   - created_by_user_id is NULL when the token was generated
--     automatically (e.g. on contract creation, for an external
--     contracting party) and set to the acting admin's id when
--     generated explicitly via "Copiar link"/"Enviar e-mail"/
--     "Copiar mensagem para WhatsApp".
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   Requires a DB user with DDL privileges (CREATE).

USE coursehub_escola;

CREATE TABLE invoice_payment_access_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  invoice_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL,

  recipient_name_snapshot VARCHAR(150) NOT NULL,
  recipient_email_snapshot VARCHAR(255) NOT NULL,

  expires_at DATETIME NOT NULL,
  invalidated_at DATETIME NULL,
  last_accessed_at DATETIME NULL,

  created_by_user_id INT NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  UNIQUE KEY uq_invoice_payment_access_tokens_hash (token_hash),
  KEY idx_invoice_payment_access_tokens_invoice (invoice_id),
  KEY idx_invoice_payment_access_tokens_lookup (invoice_id, invalidated_at, expires_at),

  CONSTRAINT fk_invoice_payment_access_tokens_invoice
    FOREIGN KEY (invoice_id)
    REFERENCES invoices(id)
    ON DELETE RESTRICT,

  CONSTRAINT fk_invoice_payment_access_tokens_created_by
    FOREIGN KEY (created_by_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'invoice_payment_access_tokens' AS table_name, COUNT(*) AS row_count FROM invoice_payment_access_tokens;
