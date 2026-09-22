-- CourseHub
-- Migration: add cancellation_reason to financial_contracts
-- Date: 2026-08-25
-- Feature: admin-registered student withdrawal (desistência)
-- MySQL: 8.0+
--
-- Purpose:
--   financial_contracts.status = 'cancelled' today has no structural
--   way to distinguish WHY a contract was cancelled (student
--   withdrawal vs. an admin cancelling a not-yet-activated
--   contracting/checkout via contractCancellationService.js, vs. any
--   other future reason) -- the only trace is free-text in
--   financial_events.reason, which is auditable but not queryable/
--   structural. cancellation_reason gives the withdrawal flow
--   (contractWithdrawalService.js#registerContractWithdrawal) a
--   structured value to set alongside status='cancelled', without
--   using free text as the only source of truth for it.
--
-- Domain rules:
--   - Nullable: only set when status = 'cancelled' AND the
--     cancellation happened through a flow that knows a specific
--     structural reason. contractCancellationService.js's generic
--     cancelFinancialContract() is intentionally left NULL here --
--     it doesn't have (and this migration doesn't invent) a
--     structural reason taxonomy for that path.
--   - Only one value exists today: 'student_withdrawal', set
--     exclusively by registerContractWithdrawal(). The free-text
--     reason/notes the admin types are still recorded as before, in
--     financial_events.reason -- this column is the structural
--     complement, not a replacement.
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   Requires a DB user with DDL privileges (ALTER).
--   MySQL DDL statements perform implicit commits, so run this only
--   after a backup.

USE coursehub_escola;

ALTER TABLE financial_contracts
  ADD COLUMN cancellation_reason
    ENUM('student_withdrawal')
    COLLATE utf8mb4_unicode_ci
    NULL
    AFTER cancelled_at;

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'financial_contracts' AS table_name, COUNT(*) AS row_count FROM financial_contracts;
SELECT cancellation_reason, COUNT(*) AS contracts_by_reason FROM financial_contracts GROUP BY cancellation_reason;
