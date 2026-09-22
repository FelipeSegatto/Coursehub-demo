-- =========================================================
-- Rollback: drop completion_rules
-- Related migration:
-- 20260816_004_create_completion_rules_table.sql
-- =========================================================
--
-- Warning:
-- Must run before rolling back 20260816_006 (certificates.completion_rule_id
-- references this table) -- or after, since certificates itself would
-- already have to be dropped first for this FK to release. Roll back
-- in reverse order: certificates, then declarations, then completion_rules.
-- =========================================================

USE coursehub_escola;

DROP TABLE IF EXISTS completion_rules;
