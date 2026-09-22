-- =========================================================
-- Rollback: drop contract_acceptances
-- Related migration:
-- 20260814_005_create_contract_acceptances_table.sql
-- =========================================================
--
-- Warning:
-- Running this rollback permanently deletes every recorded proof of
-- Terms of Use / Privacy Policy acceptance (who accepted, when,
-- which version, from where). This is a compliance/audit trail --
-- confirm this is truly intended before running, independent of
-- whether the affected contracts themselves are still active.
-- =========================================================

USE coursehub_escola;

DROP TABLE IF EXISTS contract_acceptances;
