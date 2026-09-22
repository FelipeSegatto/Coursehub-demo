-- =========================================================
-- Rollback: restore financial_events.financial_contract_id NOT NULL
-- Related migration:
-- 20260813_011_make_financial_contract_id_nullable_on_financial_events.sql
-- =========================================================
--
-- Warning:
-- Will FAIL if any row currently has financial_contract_id IS NULL
-- (an account-activation event recorded without a contract anchor).
-- Check first:
--   SELECT COUNT(*) FROM financial_events WHERE financial_contract_id IS NULL;
-- Those rows must be deleted or backfilled with a contract id before
-- this rollback can succeed.
-- =========================================================

USE coursehub_escola;

ALTER TABLE financial_events
  MODIFY COLUMN financial_contract_id INT NOT NULL;
