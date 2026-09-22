-- =========================================================
-- Rollback: drop generated_documents
-- Related migration:
-- 20260816_002_create_generated_documents_table.sql
-- =========================================================
--
-- Warning:
-- Running this rollback permanently deletes every generation/archive
-- record for issued financial documents (contracts, invoice
-- second-copies, payment receipts) -- an audit trail, not just cache.
-- The PDF files themselves (under backend/storage/generated-documents/)
-- are not deleted by this script and must be cleaned up separately if
-- truly intended.
-- =========================================================

USE coursehub_escola;

DROP TABLE IF EXISTS generated_documents;
