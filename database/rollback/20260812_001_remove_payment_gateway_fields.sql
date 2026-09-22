-- CourseHub
-- Rollback for: 20260812_001_add_payment_gateway_fields.sql
-- Date: 2026-08-12
-- MySQL: 8.0+
--
-- Important:
--   Run only if the forward migration needs to be undone.
--   This drops the new columns; any data stored in them is lost.

USE coursehub_escola;

ALTER TABLE payments
  DROP KEY idx_payment_external_reference,
  DROP KEY uq_payment_idempotency_key,
  DROP COLUMN last_synced_at,
  DROP COLUMN failure_code,
  DROP COLUMN gateway_status_detail,
  DROP COLUMN gateway_status,
  DROP COLUMN external_reference,
  DROP COLUMN currency,
  DROP COLUMN idempotency_key;
