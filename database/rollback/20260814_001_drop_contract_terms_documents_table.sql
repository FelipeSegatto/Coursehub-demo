-- =========================================================
-- Rollback: drop contract_terms_documents
-- Related migration:
-- 20260814_001_create_contract_terms_documents_table.sql
-- =========================================================
--
-- Warning:
-- Permanently deletes every frozen contract document (the exact
-- HTML shown/accepted at contract creation time). No other table
-- holds this content -- it cannot be regenerated identically once
-- deleted (re-rendering from the current template would reflect
-- today's wording, not the original).
-- =========================================================

USE coursehub_escola;

DROP TABLE IF EXISTS contract_terms_documents;
