-- CourseHub
-- Migration: create document_templates
-- Date: 2026-08-16
-- Feature: shared PDF document generation infrastructure
-- MySQL: 8.0+
--
-- Purpose:
--   Registry of versioned templates used to render formal documents
--   (financial contracts, invoice second-copies, payment receipts in
--   this phase; academic declarations/certificates and report layouts
--   in later phases). Each row points at a code-controlled renderer
--   module (template_path), not raw stored markup -- this phase has
--   no visual template editor, so the actual HTML/CSS lives in
--   backend/services/documents/templates/*.js and this table only
--   records which version is currently active per document_type.
--
-- Domain rules:
--   - A template version, once used by an emitted document, must
--     never be edited or reinterpreted -- editing a template means
--     inserting a new row with a new version, never UPDATE-ing an
--     existing one's template_path.
--   - "Only one active version per document_type" is enforced in
--     application code (backend/services/documents/documentTemplateService.js),
--     the same way backend/config/legalVersions.js enforces a single
--     current Terms/Privacy version without a DB constraint for it --
--     there is no existing precedent in this schema for a partial
--     unique index and this migration does not introduce one.
--   - created_by_user_id is NULL for the initial seed (system-authored,
--     no admin editor exists yet) and set for any future admin-driven
--     version created once such a path is built.
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   Requires a DB user with DDL privileges (CREATE).

USE coursehub_escola;

CREATE TABLE document_templates (
  id INT NOT NULL AUTO_INCREMENT,

  document_type VARCHAR(60) NOT NULL,
  name VARCHAR(150) NOT NULL,
  version VARCHAR(20) NOT NULL,
  template_path VARCHAR(255) NOT NULL,

  status ENUM('draft', 'active', 'retired') NOT NULL DEFAULT 'draft',

  created_by_user_id INT NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  UNIQUE KEY uq_document_templates_type_version (document_type, version),
  KEY idx_document_templates_type_status (document_type, status),

  CONSTRAINT fk_document_templates_created_by
    FOREIGN KEY (created_by_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'document_templates' AS table_name, COUNT(*) AS row_count FROM document_templates;
