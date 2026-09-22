-- CourseHub
-- Migration: Real payment gateway support fields on payments
-- Date: 2026-08-12
-- MySQL: 8.0+
--
-- Purpose:
--   - support a real payment gateway (Mercado Pago) alongside the
--     existing simulated gateway, without creating a parallel
--     financial schema;
--   - store the idempotency key used when creating a payment attempt
--     at the provider, so a retried request (timeout, double click,
--     duplicate form submit) can never create a second charge for
--     the same attempt;
--   - keep the provider's raw status/status_detail separate from
--     payments.status (the normalized CourseHub domain status), so
--     the gateway adapter is the only place that translates between
--     the two;
--   - store the external_reference CourseHub sends to the provider,
--     so a webhook that references it can be correlated even in the
--     rare case gateway_payment_id itself is not yet known locally.
--
-- Compatibility:
--   No existing column is renamed, retyped, or dropped.
--   payments.gateway remains a free-form varchar(50) ('simulated' or
--   'mercado_pago'), already correctly separate from payments.source
--   ('gateway' | 'admin_manual' | 'system').
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   MySQL DDL statements perform implicit commits, so run this only after a backup.

USE coursehub_escola;

ALTER TABLE payments
  ADD COLUMN idempotency_key VARCHAR(150) COLLATE utf8mb4_unicode_ci NULL AFTER gateway_payment_id,
  ADD COLUMN currency CHAR(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'BRL' AFTER amount,
  ADD COLUMN external_reference VARCHAR(150) COLLATE utf8mb4_unicode_ci NULL AFTER currency,
  ADD COLUMN gateway_status VARCHAR(40) COLLATE utf8mb4_unicode_ci NULL AFTER status,
  ADD COLUMN gateway_status_detail VARCHAR(60) COLLATE utf8mb4_unicode_ci NULL AFTER gateway_status,
  ADD COLUMN failure_code VARCHAR(60) COLLATE utf8mb4_unicode_ci NULL AFTER gateway_status_detail,
  ADD COLUMN last_synced_at DATETIME NULL AFTER failure_code,
  ADD UNIQUE KEY uq_payment_idempotency_key (idempotency_key),
  ADD KEY idx_payment_external_reference (external_reference);

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'payments' AS table_name, COUNT(*) AS row_count FROM payments;
