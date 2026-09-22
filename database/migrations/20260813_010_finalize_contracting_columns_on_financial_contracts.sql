-- CourseHub
-- Migration: finalize financial_contracts contracting-flow columns
-- Date: 2026-08-13
-- Feature: administrative contracting flow
-- MySQL: 8.0+
--
-- Purpose:
--   Final tightening step, run only after
--   20260813_009_backfill_contracting_parties_and_contract_snapshots.sql
--   has been verified clean (its own verification queries returned 0
--   rows missing student_id/course_id/contracting_party_id/origin):
--     - student_id/course_id/contracting_party_id/origin become
--       required (every row is now guaranteed to have them).
--     - enrollment_id becomes OPTIONAL -- a contract can now exist
--       before its enrollment does (the whole point of this
--       feature). Its existing UNIQUE key is untouched (MySQL unique
--       keys allow multiple NULLs, so many pending_payment contracts
--       without an enrollment yet coexist fine).
--     - FKs + indexes are added for the new columns.
--     - the old 'pending' status value is dropped from the enum (all
--       rows were remapped to 'pending_payment' by the backfill --
--       verify with `SELECT COUNT(*) FROM financial_contracts WHERE
--       status = 'pending'` returning 0 before running this).
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   Requires a DB user with DDL privileges (ALTER).
--   MySQL DDL statements perform implicit commits, so run this only
--   after a backup and after confirming the backfill migration's
--   verification queries returned 0 rows.

USE coursehub_escola;

ALTER TABLE financial_contracts
  MODIFY COLUMN enrollment_id INT NULL,
  MODIFY COLUMN student_id INT NOT NULL,
  MODIFY COLUMN course_id INT NOT NULL,
  MODIFY COLUMN contracting_party_id INT NOT NULL,
  MODIFY COLUMN origin ENUM('admin', 'public_checkout', 'migration') NOT NULL,
  MODIFY COLUMN status ENUM('pending_payment', 'active', 'overdue', 'completed', 'cancelled')
    NOT NULL DEFAULT 'pending_payment',
  ADD KEY idx_financial_contract_student (student_id),
  ADD KEY idx_financial_contract_course (course_id),
  ADD KEY idx_financial_contract_contracting_party (contracting_party_id),
  ADD KEY idx_financial_contract_origin (origin),
  ADD CONSTRAINT fk_financial_contract_student
    FOREIGN KEY (student_id) REFERENCES students(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT fk_financial_contract_course
    FOREIGN KEY (course_id) REFERENCES courses(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT fk_financial_contract_contracting_party
    FOREIGN KEY (contracting_party_id) REFERENCES contracting_parties(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT fk_financial_contract_activation_invoice
    FOREIGN KEY (activation_invoice_id) REFERENCES invoices(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT fk_financial_contract_created_by
    FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'financial_contracts' AS table_name, COUNT(*) AS row_count FROM financial_contracts;
SELECT COUNT(*) AS contracts_without_enrollment FROM financial_contracts WHERE enrollment_id IS NULL;
