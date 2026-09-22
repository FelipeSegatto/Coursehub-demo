-- =========================================================
-- Rollback: revert financial_contracts.origin enum extension
-- Related migration:
-- 20260814_006_extend_financial_contracts_origin_enum.sql
-- =========================================================
--
-- Warning:
-- Will FAIL if any row currently has origin = 'authenticated_checkout'
-- (a contract created by an authenticated student buying a second
-- course), since this rollback restores the original 3-value enum.
-- Check first:
--   SELECT COUNT(*) FROM financial_contracts WHERE origin = 'authenticated_checkout';
-- Those contracts must be reassigned (there is no safe automatic
-- remap -- 'admin' and 'public_checkout' are both factually wrong for
-- them) or this rollback skipped entirely.
-- =========================================================

USE coursehub_escola;

ALTER TABLE financial_contracts
  MODIFY COLUMN origin ENUM('admin', 'public_checkout', 'migration')
    NOT NULL;
