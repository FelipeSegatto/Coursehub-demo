-- =========================================================
-- Rollback: drop account_activation_tokens
-- Related migration:
-- 20260813_003_create_account_activation_tokens_table.sql
-- =========================================================
--
-- Warning:
-- Running this rollback permanently removes all activation-link
-- history. Any user still pending_activation loses their current
-- activation link and needs a new one generated after this table
-- exists again.
-- =========================================================

USE coursehub_escola;

DROP TABLE IF EXISTS account_activation_tokens;
