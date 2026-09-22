-- =========================================================
-- Rollback: drop public_checkout_sessions
-- Related migration:
-- 20260814_004_create_public_checkout_sessions_table.sql
-- =========================================================
--
-- Warning:
-- Running this rollback permanently removes every public checkout
-- session, including ones already converted into a real
-- financial_contract (financial_contracts itself is untouched --
-- only the session record linking back to it is lost, which only
-- affects checkout-funnel analytics, not the contract/invoice
-- themselves). Anyone mid-checkout (session not yet converted) loses
-- their progress and must restart from the course page.
-- =========================================================

USE coursehub_escola;

DROP TABLE IF EXISTS public_checkout_sessions;
