-- =========================================================
-- Rollback: drop invoice_payment_access_tokens
-- Related migration:
-- 20260814_002_create_invoice_payment_access_tokens_table.sql
-- =========================================================
--
-- Warning:
-- Running this rollback permanently removes every private
-- invoice-payment link ever generated. Any contracting party
-- currently holding a valid "/pagamento/fatura?token=..." link loses
-- access and needs a new link generated after this table exists
-- again. Run 20260814_003 (invoice_payment_sessions) rollback FIRST --
-- it has a FK referencing this table.
-- =========================================================

USE coursehub_escola;

DROP TABLE IF EXISTS invoice_payment_access_tokens;
