-- CourseHub
-- Migration: add 'debit_card' to payments.payment_method
-- Date: 2026-08-24
-- Feature: admin financial flow fixes -- manual payment method alignment
-- MySQL: 8.0+
--
-- Purpose:
--   The admin "registrar pagamento manual" modal already offered
--   'debit_card' as an option (coursehub/src/components/financial/
--   RegisterManualPaymentModal.jsx), but payments.payment_method never
--   had that value in its enum -- confirmed live against the dev
--   database (`SHOW COLUMNS FROM payments LIKE 'payment_method'` ->
--   enum('pix','boleto','credit_card','bank_transfer','cash','other'),
--   no 'debit_card'). Submitting it would fail with
--   WARN_DATA_TRUNCATED. This migration only closes that gap so the
--   admin-side allow-list (paymentService.js#registerManualPayment)
--   can legitimately accept it.
--
-- Domain rules:
--   - Manual/admin registration only (source='admin_manual'). The
--     student-facing online checkout (invoicePaymentService.js) is
--     untouched -- it still only accepts pix/boleto/credit_card,
--     the methods the payment gateways actually process.
--   - No existing value removed or renamed -- every current row keeps
--     its exact value.
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   Requires a DB user with DDL privileges (ALTER).
--   MySQL DDL statements perform implicit commits, so run this only
--   after a backup. Adding an ENUM value via MODIFY COLUMN is a
--   metadata-only change in MySQL 8 (no table rebuild, near-instant).

USE coursehub_escola;

ALTER TABLE payments
  MODIFY COLUMN payment_method
    ENUM('pix', 'boleto', 'credit_card', 'debit_card', 'bank_transfer', 'cash', 'other')
    COLLATE utf8mb4_unicode_ci NOT NULL;

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'payments' AS table_name, COUNT(*) AS row_count FROM payments;
SELECT payment_method, COUNT(*) AS payments_by_method FROM payments GROUP BY payment_method;
