-- =========================================================
-- Rollback: revert contracting-party backfill on financial_contracts
-- Related migration:
-- 20260813_009_backfill_contracting_parties_and_contract_snapshots.sql
-- =========================================================
--
-- Warning:
-- This clears the columns the backfill filled and removes the
-- 'self' contracting_party rows/links it created for pre-existing
-- students. It does NOT restore the old 'pending' status label (that
-- information is gone once remapped to 'pending_payment' -- both
-- values mean the same thing, so this is not a data loss in
-- practice). Only run this BEFORE 20260813_010 (which depends on
-- these columns being filled).
-- =========================================================

USE coursehub_escola;

UPDATE financial_contracts
SET origin = 'migration'
WHERE origin = 'migration';

DELETE scp FROM student_contracting_parties scp
INNER JOIN contracting_parties cp ON cp.id = scp.contracting_party_id
WHERE scp.relationship_type = 'self'
  AND cp.user_id IS NOT NULL;

DELETE cp FROM contracting_parties cp
WHERE cp.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM student_contracting_parties scp WHERE scp.contracting_party_id = cp.id
  );

UPDATE financial_contracts
SET
  student_id = NULL,
  course_id = NULL,
  contracting_party_id = NULL,
  activation_invoice_id = NULL,
  origin = NULL,
  contracting_party_name = NULL,
  contracting_party_document = NULL,
  contracting_party_email = NULL,
  contracting_party_phone = NULL,
  contracting_party_address = NULL,
  status = CASE WHEN status = 'pending_payment' THEN 'pending' ELSE status END;
