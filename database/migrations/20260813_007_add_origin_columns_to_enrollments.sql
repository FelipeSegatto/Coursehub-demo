-- CourseHub
-- Migration: add origin/creation-audit columns to enrollments
-- Date: 2026-08-13
-- Feature: administrative contracting flow
-- MySQL: 8.0+
--
-- Purpose:
--   Standardizes how an enrollment came to exist. Every existing row
--   predates this column and was, in fact, created through the
--   standard admin commercial flow (adminEnrollmentService.
--   createEnrollment) -- so DEFAULT 'commercial' is not a guess, it
--   is the accurate historical origin for 100% of current rows,
--   auto-filled by MySQL for every existing row as part of this
--   single ADD COLUMN statement (no separate backfill needed for
--   this column).
--
-- Domain rules:
--   - origin never includes a "pending_payment" value -- that
--     concept belongs to financial_contracts.status, not to the
--     enrollment itself (an enrollment, once it exists, is always
--     already active/suspended/completed/cancelled; it never
--     represents "awaiting payment").
--   - created_by_user_id is left NULL for historical rows (genuinely
--     unknown -- never fabricated); populated going forward from the
--     authenticated admin's token.
--   - activated_at is left NULL for historical rows for the same
--     reason; populated going forward at the moment
--     activateContractFromPaidInvoice creates the enrollment.
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   MySQL DDL statements perform implicit commits, so run this only
--   after a backup.

USE coursehub_escola;

ALTER TABLE enrollments
  ADD COLUMN origin ENUM('commercial', 'manual_external_payment', 'scholarship', 'courtesy', 'migration', 'administrative')
    NOT NULL DEFAULT 'commercial' AFTER status,
  ADD COLUMN created_by_user_id INT NULL AFTER origin,
  ADD COLUMN activated_at DATETIME NULL AFTER created_by_user_id,
  ADD CONSTRAINT fk_enrollments_created_by
    FOREIGN KEY (created_by_user_id)
    REFERENCES users(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'enrollments' AS table_name, COUNT(*) AS row_count FROM enrollments;
SELECT origin, COUNT(*) AS row_count FROM enrollments GROUP BY origin;
