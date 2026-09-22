-- CourseHub
-- Migration: extend financial_contracts.origin enum
-- Date: 2026-08-14
-- Feature: multi-channel checkout -- authenticated course purchase
-- MySQL: 8.0+
--
-- Purpose:
--   An authenticated student buying a second course is a distinct
--   origin from an anonymous 'public_checkout' -- both bypass the
--   admin wizard, but only the authenticated one starts from an
--   already-identified, already-logged-in student. Keeping them
--   distinguishable matters for reporting (the admin contract list
--   and FinancialEventsTimeline already render `origin` as a labelled
--   value).
--
-- Domain rules:
--   - Adds 'authenticated_checkout' to the existing enum
--     ('admin', 'public_checkout', 'migration'). No existing value is
--     removed or renamed -- every current row keeps its exact value.
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   Requires a DB user with DDL privileges (ALTER).
--   MySQL DDL statements perform implicit commits, so run this only
--   after a backup. Adding an ENUM value via MODIFY COLUMN is a
--   metadata-only change in MySQL 8 (no table rebuild, near-instant).

USE coursehub_escola;

ALTER TABLE financial_contracts
  MODIFY COLUMN origin ENUM('admin', 'public_checkout', 'authenticated_checkout', 'migration')
    NOT NULL;

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'financial_contracts' AS table_name, COUNT(*) AS row_count FROM financial_contracts;
SELECT origin, COUNT(*) AS contracts_by_origin FROM financial_contracts GROUP BY origin;
