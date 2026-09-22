-- =========================================================
-- Rollback: revert financial_contracts contracting-flow finalization
-- Related migration:
-- 20260813_010_finalize_contracting_columns_on_financial_contracts.sql
-- =========================================================
--
-- Warning:
-- Will FAIL if any row currently has enrollment_id IS NULL (a
-- contract created by the new flow that has not been paid/activated
-- yet), since this rollback restores enrollment_id NOT NULL. Check
-- first:
--   SELECT id FROM financial_contracts WHERE enrollment_id IS NULL;
-- Those contracts must be cancelled/resolved (or this rollback
-- skipped) before running.
-- =========================================================

USE coursehub_escola;

ALTER TABLE financial_contracts
  DROP FOREIGN KEY fk_financial_contract_created_by,
  DROP FOREIGN KEY fk_financial_contract_activation_invoice,
  DROP FOREIGN KEY fk_financial_contract_contracting_party,
  DROP FOREIGN KEY fk_financial_contract_course,
  DROP FOREIGN KEY fk_financial_contract_student,
  DROP KEY idx_financial_contract_origin,
  DROP KEY idx_financial_contract_contracting_party,
  DROP KEY idx_financial_contract_course,
  DROP KEY idx_financial_contract_student,
  MODIFY COLUMN status ENUM('pending', 'pending_payment', 'active', 'overdue', 'completed', 'cancelled')
    NOT NULL DEFAULT 'pending_payment',
  MODIFY COLUMN origin ENUM('admin', 'public_checkout', 'migration') NULL,
  MODIFY COLUMN contracting_party_id INT NULL,
  MODIFY COLUMN course_id INT NULL,
  MODIFY COLUMN student_id INT NULL,
  MODIFY COLUMN enrollment_id INT NOT NULL;
