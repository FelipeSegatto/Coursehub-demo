-- CourseHub
-- Migration: backfill contracting parties + financial_contracts snapshot columns
-- Date: 2026-08-13
-- Feature: administrative contracting flow
-- MySQL: 8.0+
--
-- Purpose:
--   Fills in the optional columns added by
--   20260813_005_add_contracting_columns_to_financial_contracts.sql
--   for every financial_contracts row that predates the contracting
--   flow, WITHOUT fabricating any data:
--     1. student_id/course_id are derived from the existing
--        enrollment_id (100% known, not a guess).
--     2. Every distinct student behind such a contract gets exactly
--        one 'self' contracting_party, built from their own existing
--        students row (name/cpf/email/phone/address) -- this is the
--        accurate historical fact: before this feature existed, the
--        student themselves WAS the financial responsible.
--     3. financial_contracts.contracting_party_id and the commercial
--        snapshot columns are filled from that same 'self' party.
--     4. status 'pending' is remapped to 'pending_payment' (same
--        meaning, new name).
--     5. origin is set to 'migration' -- these contracts predate the
--        admin wizard and must never be treated as a new sale.
--     6. activation_invoice_id is set to each contract's earliest
--        invoice (MIN(id)) as the closest honest equivalent of "the
--        invoice that gated activation" for pre-existing data. This
--        is a best-effort backfill approximation for historical rows
--        only -- going forward, activation_invoice_id is always set
--        explicitly at contract-creation time, never inferred.
--
--   created_by_user_id is deliberately left NULL for every backfilled
--   row (genuinely unknown who created each historical contract --
--   never fabricated).
--
-- Idempotent:
--   Every INSERT/UPDATE below is guarded (WHERE ... IS NULL / NOT
--   EXISTS), so re-running this file after a partial or full success
--   is a safe no-op on rows already filled.
--
-- Important:
--   Run this only after 20260813_002 through 20260813_008. Do not
--   run 20260813_010 (which makes these columns required) before
--   reviewing this file's own verification output at the bottom.

USE coursehub_escola;

-- Step 1: derive student_id/course_id from the existing enrollment.
UPDATE financial_contracts fc
INNER JOIN enrollments e ON e.id = fc.enrollment_id
SET fc.student_id = e.student_id,
    fc.course_id = e.course_id
WHERE fc.student_id IS NULL OR fc.course_id IS NULL;

-- Step 2: create one 'self' contracting_party per distinct student
-- who is behind a contract still missing one.
INSERT INTO contracting_parties
  (user_id, party_type, name, document_type, document_number, email, phone,
   billing_address_line, status, created_at, updated_at)
SELECT
  s.user_id,
  'individual',
  s.name,
  'cpf',
  REPLACE(REPLACE(REPLACE(s.cpf, '.', ''), '-', ''), '/', ''),
  s.email,
  s.phone,
  s.address,
  'active',
  NOW(),
  NOW()
FROM students s
WHERE s.id IN (
    SELECT DISTINCT student_id
    FROM financial_contracts
    WHERE student_id IS NOT NULL AND contracting_party_id IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM contracting_parties cp WHERE cp.user_id = s.user_id
  );

-- Step 3: link each such student to their 'self' contracting party.
INSERT INTO student_contracting_parties
  (student_id, contracting_party_id, relationship_type, is_primary, created_at)
SELECT
  s.id, cp.id, 'self', 1, NOW()
FROM students s
INNER JOIN contracting_parties cp ON cp.user_id = s.user_id
WHERE s.id IN (
    SELECT DISTINCT student_id
    FROM financial_contracts
    WHERE student_id IS NOT NULL AND contracting_party_id IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM student_contracting_parties scp
    WHERE scp.student_id = s.id AND scp.contracting_party_id = cp.id
  );

-- Step 4: fill financial_contracts.contracting_party_id + commercial snapshot.
UPDATE financial_contracts fc
INNER JOIN student_contracting_parties scp
  ON scp.student_id = fc.student_id AND scp.relationship_type = 'self' AND scp.is_primary = 1
INNER JOIN contracting_parties cp ON cp.id = scp.contracting_party_id
SET
  fc.contracting_party_id = cp.id,
  fc.contracting_party_name = cp.name,
  fc.contracting_party_document = cp.document_number,
  fc.contracting_party_email = cp.email,
  fc.contracting_party_phone = cp.phone,
  fc.contracting_party_address = JSON_OBJECT(
    'line', cp.billing_address_line,
    'city', cp.billing_address_city,
    'state', cp.billing_address_state,
    'zipCode', cp.billing_address_zip_code
  )
WHERE fc.contracting_party_id IS NULL;

-- Step 5: remap the old 'pending' status value.
UPDATE financial_contracts
SET status = 'pending_payment'
WHERE status = 'pending';

-- Step 6: mark every pre-existing contract as origin = 'migration'.
UPDATE financial_contracts
SET origin = 'migration'
WHERE origin IS NULL;

-- Step 7: best-effort activation_invoice_id = earliest invoice on the contract.
UPDATE financial_contracts fc
INNER JOIN (
  SELECT financial_contract_id, MIN(id) AS first_invoice_id
  FROM invoices
  GROUP BY financial_contract_id
) first_invoice ON first_invoice.financial_contract_id = fc.id
SET fc.activation_invoice_id = first_invoice.first_invoice_id
WHERE fc.activation_invoice_id IS NULL;

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION -- review before running 20260813_010
-- -----------------------------------------------------------------------------

-- Must return 0 rows. Any row here means backfill could not derive a
-- required value (missing enrollment, orphan student, etc.) --
-- investigate manually before tightening constraints.
SELECT id, enrollment_id, student_id, course_id, contracting_party_id, origin, status
FROM financial_contracts
WHERE student_id IS NULL OR course_id IS NULL OR contracting_party_id IS NULL OR origin IS NULL;

-- Informational only -- contracts with no invoice at all keep
-- activation_invoice_id NULL (expected to stay NULL going forward
-- only for genuinely draft-less legacy edge cases, if any).
SELECT id, status FROM financial_contracts WHERE activation_invoice_id IS NULL;

SELECT status, COUNT(*) AS row_count FROM financial_contracts GROUP BY status;
SELECT origin, COUNT(*) AS row_count FROM financial_contracts GROUP BY origin;
