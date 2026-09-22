-- =========================================================
-- Rollback: drop document_templates
-- Related migration:
-- 20260816_001_create_document_templates_table.sql
-- =========================================================
--
-- Warning:
-- Only safe to run before 20260816_002_create_generated_documents_table.sql
-- has been applied (or after it has already been rolled back) --
-- generated_documents.template_id references this table.
-- =========================================================

USE coursehub_escola;

DROP TABLE IF EXISTS document_templates;
