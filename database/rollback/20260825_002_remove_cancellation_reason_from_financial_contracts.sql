-- =========================================================
-- Rollback: remove cancellation_reason from financial_contracts
-- Related migration:
-- 20260825_002_add_cancellation_reason_to_financial_contracts.sql
-- =========================================================
--
-- Safe to run even with existing 'student_withdrawal' rows -- unlike
-- an ENUM value removed from an existing column, dropping a whole
-- column has no "existing value doesn't fit anymore" failure mode.
-- The distinction those rows carried (why the contract was cancelled)
-- is lost from the structural column, but remains in
-- financial_events.reason (free text) for each contract's
-- contract_withdrawal_registered event.
-- =========================================================

USE coursehub_escola;

ALTER TABLE financial_contracts
  DROP COLUMN cancellation_reason;
