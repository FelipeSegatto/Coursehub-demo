-- CourseHub
-- Migration: add contracting-flow columns to financial_contracts
-- Date: 2026-08-13
-- Feature: administrative contracting flow
-- MySQL: 8.0+
--
-- Purpose:
--   Step 2 of the contracting-flow migration ordering (see plan):
--   add every new column as OPTIONAL first. Backfill (a later
--   migration) derives values for existing rows; only after that do
--   we tighten constraints (NOT NULL, FKs, indexes) in a follow-up
--   migration. This migration alone does not break any existing
--   read/write path -- enrollment_id stays NOT NULL for now, and the
--   'pending' status value is kept (not replaced) so existing rows
--   remain valid until the backfill maps them to 'pending_payment'.
--
-- Domain rules introduced here:
--   - A contract can now exist BEFORE an enrollment (student_id +
--     course_id identify who/what it's for; enrollment_id is filled
--     in only once payment is confirmed and activateContractFromPaidInvoice
--     creates the enrollment).
--   - contracting_party_id points at the current contracting party;
--     contracting_party_name/document/email/phone/address are a
--     SNAPSHOT taken at contract creation time -- they never change
--     retroactively if the contracting party's own record is edited
--     later, since a contract's commercial terms must stay stable
--     once created.
--   - activation_invoice_id identifies which invoice, once paid,
--     triggers activation -- set right after that first invoice is
--     created (financial_contracts row is inserted first without it,
--     matching the existing invoices -> financial_contract_id FK
--     direction; no circular-insert problem).
--   - created_by_user_id is always derived server-side from the
--     authenticated admin's token, never accepted from the frontend.
--   - origin distinguishes how the contract came to exist:
--     'admin' (created via the admin wizard), 'public_checkout'
--     (future self-service flow), 'migration' (legacy import, see
--     enrollment_migration_details).
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   MySQL DDL statements perform implicit commits, so run this only
--   after a backup.

USE coursehub_escola;

ALTER TABLE financial_contracts
  MODIFY COLUMN status ENUM('pending', 'pending_payment', 'active', 'overdue', 'completed', 'cancelled')
    NOT NULL DEFAULT 'pending_payment',
  ADD COLUMN student_id INT NULL AFTER enrollment_id,
  ADD COLUMN course_id INT NULL AFTER student_id,
  ADD COLUMN contracting_party_id INT NULL AFTER course_id,
  ADD COLUMN activation_invoice_id INT NULL AFTER contracting_party_id,
  ADD COLUMN created_by_user_id INT NULL AFTER activation_invoice_id,
  ADD COLUMN origin ENUM('admin', 'public_checkout', 'migration') NULL AFTER created_by_user_id,
  ADD COLUMN activated_at DATETIME NULL AFTER start_date,
  ADD COLUMN contracting_party_name VARCHAR(150) NULL AFTER activated_at,
  ADD COLUMN contracting_party_document VARCHAR(30) NULL AFTER contracting_party_name,
  ADD COLUMN contracting_party_email VARCHAR(150) NULL AFTER contracting_party_document,
  ADD COLUMN contracting_party_phone VARCHAR(30) NULL AFTER contracting_party_email,
  ADD COLUMN contracting_party_address JSON NULL AFTER contracting_party_phone;

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'financial_contracts' AS table_name, COUNT(*) AS row_count FROM financial_contracts;
