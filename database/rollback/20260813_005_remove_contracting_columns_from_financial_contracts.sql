-- =========================================================
-- Rollback: remove contracting-flow columns from financial_contracts
-- Related migration:
-- 20260813_005_add_contracting_columns_to_financial_contracts.sql
-- =========================================================
--
-- Warning:
-- Only safe to run BEFORE the backfill migration and BEFORE
-- 20260813_008 (which makes some of these columns NOT NULL and adds
-- FKs). Running this after those permanently deletes contract-level
-- contracting-party/origin/activation data.
-- =========================================================

USE coursehub_escola;

ALTER TABLE financial_contracts
  DROP COLUMN contracting_party_address,
  DROP COLUMN contracting_party_phone,
  DROP COLUMN contracting_party_email,
  DROP COLUMN contracting_party_document,
  DROP COLUMN contracting_party_name,
  DROP COLUMN activated_at,
  DROP COLUMN origin,
  DROP COLUMN created_by_user_id,
  DROP COLUMN activation_invoice_id,
  DROP COLUMN contracting_party_id,
  DROP COLUMN course_id,
  DROP COLUMN student_id,
  MODIFY COLUMN status ENUM('pending', 'active', 'overdue', 'completed', 'cancelled')
    NOT NULL DEFAULT 'pending';
