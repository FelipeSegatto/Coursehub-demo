-- CourseHub
-- Migration: create enrollment_migration_details
-- Date: 2026-08-13
-- Feature: administrative contracting flow -- "Matricula por migracao"
-- MySQL: 8.0+
--
-- Purpose:
--   Backs the "Importar somente a matricula" / "Registrar tambem
--   contrato legado" admin feature: importing a pre-existing
--   enrollment from outside CourseHub (a legacy system) without
--   fabricating a new sale or a fake entry invoice. One row per
--   enrollment created through the migration origin.
--
-- Domain rules:
--   - One-to-one with enrollments (UNIQUE enrollment_id): a migrated
--     enrollment has exactly one migration record, never more.
--   - Never fabricates past payments -- legacy_financial_status is a
--     free-text snapshot of what the source system reported, not a
--     new payments/invoices row.
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   MySQL DDL statements perform implicit commits, so run this only
--   after a backup.

USE coursehub_escola;

CREATE TABLE enrollment_migration_details (
  id INT NOT NULL AUTO_INCREMENT,

  enrollment_id INT NOT NULL,

  migration_source VARCHAR(100) NOT NULL,
  legacy_enrollment_id VARCHAR(100) NULL,
  original_enrollment_date DATE NOT NULL,
  legacy_financial_status VARCHAR(100) NULL,
  notes VARCHAR(1000) NULL,

  migrated_by_user_id INT NOT NULL,
  migrated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  UNIQUE KEY uq_enrollment_migration_enrollment (enrollment_id),

  CONSTRAINT fk_enrollment_migration_enrollment
    FOREIGN KEY (enrollment_id)
    REFERENCES enrollments(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  CONSTRAINT fk_enrollment_migration_actor
    FOREIGN KEY (migrated_by_user_id)
    REFERENCES users(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'enrollment_migration_details' AS table_name, COUNT(*) AS row_count FROM enrollment_migration_details;
