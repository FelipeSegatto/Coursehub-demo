-- CourseHub
-- Migration: create generated_documents
-- Date: 2026-08-16
-- Feature: shared PDF document generation infrastructure
-- MySQL: 8.0+
--
-- Purpose:
--   Single generation/archive record for every formal PDF document
--   issued by CourseHub (financial contracts, invoice second-copies,
--   payment receipts in this phase; academic declarations and
--   certificates in a later phase). This table tracks the lifecycle
--   of a generation job and the resulting file's storage/audit
--   metadata -- it is not a replacement for domain entities (invoices,
--   payments, financial_contracts remain the source of truth for the
--   underlying facts) and it never stores the PDF binary itself, only
--   a private storage_key resolved by backend/services/documents/documentStorageService.js.
--
-- Domain rules:
--   - idempotency_key is built per document type by the calling
--     domain service (see backend/services/financial/*DocumentService.js)
--     so that retries and "already generated, just show me the
--     existing one" requests never produce two rows or two files for
--     the same logical document. It intentionally is NOT just
--     (document_type, subject_id): a payment receipt is one-per-payment
--     forever, but an invoice second-copy is one-per-(invoice, status)
--     since the file legitimately changes as the invoice's real state
--     changes (open -> overdue -> paid), and each of those is its own
--     immutable snapshot rather than an overwrite.
--   - locked_by / locked_until implement the same claim-with-lease
--     pattern already used by the notification outbox worker
--     (backend/services/notifications/notificationDeliveryService.js),
--     letting backend/workers/documentGenerationWorker.js claim a
--     'queued' row atomically and recover a row whose lease expired
--     without a second worker racing it.
--   - snapshot_json is the frozen data the PDF was rendered from --
--     once a document reaches 'ready', later changes to the underlying
--     invoice/contract/payment rows must never change what a
--     previously issued document says.
--   - status only ever moves queued -> generating -> (ready | failed),
--     and separately ready -> revoked. failure_reason is sanitized
--     before being stored (never a raw stack trace) since it can be
--     surfaced to an admin retry UI.
--   - Deleting the underlying financial_contracts/invoices/payments
--     row is not a supported operation anywhere else in this schema,
--     so subject_id intentionally has no FOREIGN KEY -- it is
--     polymorphic across subject_type and cannot target a single
--     parent table.
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   Requires a DB user with DDL privileges (CREATE).

USE coursehub_escola;

CREATE TABLE generated_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  document_type VARCHAR(60) NOT NULL,
  subject_type VARCHAR(40) NOT NULL,
  subject_id INT NOT NULL,

  idempotency_key VARCHAR(191) NOT NULL,

  template_id INT NULL,
  template_version VARCHAR(20) NULL,

  status ENUM('queued', 'generating', 'ready', 'failed', 'revoked')
    NOT NULL DEFAULT 'queued',

  storage_key VARCHAR(255) NULL,
  file_hash CHAR(64) NULL,
  file_size_bytes INT UNSIGNED NULL,

  snapshot_json JSON NOT NULL,

  generated_by_user_id INT NULL,
  generated_at DATETIME NULL,
  expires_at DATETIME NULL,

  failure_reason VARCHAR(500) NULL,
  attempt_count TINYINT UNSIGNED NOT NULL DEFAULT 0,

  locked_by VARCHAR(191) NULL,
  locked_until DATETIME NULL,

  revoked_at DATETIME NULL,
  revoked_by_user_id INT NULL,
  revocation_reason VARCHAR(500) NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  UNIQUE KEY uq_generated_documents_idempotency (idempotency_key),
  KEY idx_generated_documents_subject (subject_type, subject_id),
  KEY idx_generated_documents_type_status (document_type, status),

  CONSTRAINT fk_generated_documents_template
    FOREIGN KEY (template_id)
    REFERENCES document_templates(id)
    ON DELETE SET NULL,

  CONSTRAINT fk_generated_documents_generated_by
    FOREIGN KEY (generated_by_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL,

  CONSTRAINT fk_generated_documents_revoked_by
    FOREIGN KEY (revoked_by_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'generated_documents' AS table_name, COUNT(*) AS row_count FROM generated_documents;
