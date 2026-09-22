-- =========================================================
-- Rollback: remove 'debit_card' from payments.payment_method
-- Related migration:
-- 20260824_002_add_debit_card_to_payment_method.sql
-- =========================================================
--
-- Warning:
-- Will FAIL if any row currently has payment_method = 'debit_card',
-- since this rollback restores the original 6-value enum. Check first:
--   SELECT COUNT(*) FROM payments WHERE payment_method = 'debit_card';
-- Those rows have no safe automatic remap -- reassign manually first
-- (e.g. to 'other', with the real method noted in admin_note) or skip
-- this rollback entirely.
-- =========================================================

USE coursehub_escola;

ALTER TABLE payments
  MODIFY COLUMN payment_method
    ENUM('pix', 'boleto', 'credit_card', 'bank_transfer', 'cash', 'other')
    COLLATE utf8mb4_unicode_ci NOT NULL;
