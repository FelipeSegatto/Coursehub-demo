-- =========================================================
-- Rollback: drop contracting_parties and student_contracting_parties
-- Related migration:
-- 20260813_002_create_contracting_parties_tables.sql
-- =========================================================
--
-- Warning:
-- Running this rollback permanently removes every contracting-party
-- record and their link to students. Only safe if no
-- financial_contracts row has been backfilled with a
-- contracting_party_id yet (run before
-- 20260813_005/006_add_contract_columns_to_financial_contracts.sql
-- and the backfill migration, or after reverting those first).
-- =========================================================

USE coursehub_escola;

DROP TABLE IF EXISTS student_contracting_parties;
DROP TABLE IF EXISTS contracting_parties;
