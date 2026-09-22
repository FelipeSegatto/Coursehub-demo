-- CourseHub
-- Migration: create certificates
-- Date: 2026-08-16
-- Feature: academic documents (declarations and certificates) -- Fase 2
-- MySQL: 8.0+
--
-- Purpose:
--   Domain entity for issued course-completion certificates. Distinct
--   from generated_documents (Fase 0) the same way declarations is:
--   this is the durable academic/audit record, generated_documents is
--   the PDF generation/storage record. eligibility_snapshot freezes
--   the exact per-requirement evaluation
--   (backend/services/academic/enrollmentCompletionService.js's
--   output) at the moment of issuance -- proof of why the certificate
--   was granted, independent of whatever the student's live progress/
--   attendance/grades look like later.
--
--   Replaces an untracked, unreferenced, empty legacy `certificates`
--   table dropped in 20260816_003 (see that migration's header) --
--   it had no link to a versioned completion rule, no eligibility
--   record, and no public verification code.
--
-- Domain rules:
--   - At most one 'active' certificate per enrollment_id is enforced
--     in application code (backend/services/academic/certificateService.js,
--     checked inside the issuing transaction), the same "no DB
--     constraint, checked before insert" convention already used by
--     document_templates/completion_rules for "only one active".
--   - Certificates are only ever issued by an admin
--     (issued_by_user_id NOT NULL, unlike declarations' nullable
--     requested_by_user_id) after evaluateEnrollmentCompletion
--     confirms eligibility -- there is no automatic/system-issued
--     path in this phase.
--   - Revocation/reissuance follows the identical pattern to
--     declarations (revoked_at/by/reason, superseded_by_certificate_id
--     chain, new verification_code on reissue, old row never deleted
--     or mutated after issuance).
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   Requires a DB user with DDL privileges (CREATE).
--   Must run after 20260816_004 (completion_rules) and after
--   20260816_002 (generated_documents).

USE coursehub_escola;

CREATE TABLE certificates (
  id INT NOT NULL AUTO_INCREMENT,

  enrollment_id INT NOT NULL,
  completion_rule_id INT NOT NULL,
  eligibility_snapshot JSON NOT NULL,

  generated_document_id BIGINT UNSIGNED NULL,
  verification_code CHAR(12) NOT NULL,

  status ENUM('active', 'revoked') NOT NULL DEFAULT 'active',

  issued_by_user_id INT NOT NULL,

  revoked_at DATETIME NULL,
  revoked_by_user_id INT NULL,
  revocation_reason VARCHAR(500) NULL,

  superseded_by_certificate_id INT NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  UNIQUE KEY uq_certificates_verification_code (verification_code),
  KEY idx_certificates_enrollment (enrollment_id),

  CONSTRAINT fk_certificates_enrollment
    FOREIGN KEY (enrollment_id)
    REFERENCES enrollments(id)
    ON DELETE RESTRICT,

  CONSTRAINT fk_certificates_rule
    FOREIGN KEY (completion_rule_id)
    REFERENCES completion_rules(id)
    ON DELETE RESTRICT,

  CONSTRAINT fk_certificates_document
    FOREIGN KEY (generated_document_id)
    REFERENCES generated_documents(id)
    ON DELETE SET NULL,

  CONSTRAINT fk_certificates_issued_by
    FOREIGN KEY (issued_by_user_id)
    REFERENCES users(id)
    ON DELETE RESTRICT,

  CONSTRAINT fk_certificates_revoked_by
    FOREIGN KEY (revoked_by_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL,

  CONSTRAINT fk_certificates_superseded
    FOREIGN KEY (superseded_by_certificate_id)
    REFERENCES certificates(id)
    ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'certificates' AS table_name, COUNT(*) AS row_count FROM certificates;
