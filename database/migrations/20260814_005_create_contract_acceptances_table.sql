-- CourseHub
-- Migration: create contract_acceptances
-- Date: 2026-08-14
-- Feature: multi-channel checkout -- contractual acceptance record
-- MySQL: 8.0+
--
-- Purpose:
--   Records the explicit acceptance of the Terms of Use and Privacy
--   Policy for a financial_contract at the moment of checkout --
--   who accepted, on whose behalf, which document versions, how
--   (channel), and from where. This is distinct from
--   contract_terms_documents, which only freezes the CONTRACT's own
--   HTML at creation time and has no accepted_by/accepted_at/IP
--   columns; contract_acceptances is the actual consent record.
--
-- Domain rules:
--   - At most one acceptance row per contract (UNIQUE on
--     financial_contract_id), mirroring contract_terms_documents'
--     own one-per-contract precedent -- a contract is created once,
--     and its acceptance is captured once, in the same transaction,
--     never edited afterwards.
--   - accepted_by_user_id is NULL for a checkout completed by a
--     visitor with no CourseHub account yet (public checkout,
--     third-party contracting party, or the external invoice payment
--     link) and set to the authenticated user's id for the
--     authenticated checkout / authenticated invoice payment paths.
--   - accepted_name_snapshot/accepted_document_snapshot/
--     accepted_email_snapshot freeze who actually clicked accept,
--     independent of any later change to the contracting party's own
--     record.
--   - terms_version/privacy_version are opaque version strings (see
--     backend/config/legalVersions.js /
--     coursehub/src/constants/legalVersions.js) -- the backend always
--     validates the version submitted by the client matches the
--     current server-side constant, rejecting a stale cached
--     frontend rather than silently recording an outdated version as
--     if it were current.
--   - Contracts created through the existing admin wizard
--     (ContractCreationModal.jsx) do not pass an acceptance block and
--     therefore get zero rows here -- no backfill, 'admin_legacy' is
--     reserved for a possible future manual-capture path and is not
--     populated by this migration.
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   Requires a DB user with DDL privileges (CREATE).

USE coursehub_escola;

CREATE TABLE contract_acceptances (
  id INT NOT NULL AUTO_INCREMENT,

  financial_contract_id INT NOT NULL,
  accepted_by_user_id INT NULL,
  contracting_party_id INT NOT NULL,

  accepted_name_snapshot VARCHAR(150) NOT NULL,
  accepted_document_snapshot VARCHAR(20) NOT NULL,
  accepted_email_snapshot VARCHAR(255) NOT NULL,

  terms_version VARCHAR(20) NOT NULL,
  privacy_version VARCHAR(20) NOT NULL,

  acceptance_method ENUM('public_checkout', 'authenticated_checkout', 'invoice_payment_link', 'admin_legacy')
    NOT NULL,

  accepted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(500) NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  UNIQUE KEY uq_contract_acceptances_contract (financial_contract_id),
  KEY idx_contract_acceptances_party (contracting_party_id),

  CONSTRAINT fk_contract_acceptances_contract
    FOREIGN KEY (financial_contract_id)
    REFERENCES financial_contracts(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_contract_acceptances_party
    FOREIGN KEY (contracting_party_id)
    REFERENCES contracting_parties(id)
    ON DELETE RESTRICT,

  CONSTRAINT fk_contract_acceptances_user
    FOREIGN KEY (accepted_by_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'contract_acceptances' AS table_name, COUNT(*) AS row_count FROM contract_acceptances;
