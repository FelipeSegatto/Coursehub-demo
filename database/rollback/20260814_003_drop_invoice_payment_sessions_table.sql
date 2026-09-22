-- =========================================================
-- Rollback: drop invoice_payment_sessions
-- Related migration:
-- 20260814_003_create_invoice_payment_sessions_table.sql
-- =========================================================
--
-- Warning:
-- Running this rollback immediately logs out every contracting party
-- currently in the middle of paying an invoice via the private
-- payment link (their session cookie stops resolving to anything).
-- They can re-open their original link to establish a new session,
-- as long as invoice_payment_access_tokens still has it valid. Must
-- run BEFORE rolling back 20260814_002
-- (invoice_payment_access_tokens) -- this table has a FK to it.
-- =========================================================

USE coursehub_escola;

DROP TABLE IF EXISTS invoice_payment_sessions;
