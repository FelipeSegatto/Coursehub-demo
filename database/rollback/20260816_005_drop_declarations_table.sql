-- =========================================================
-- Rollback: drop declarations
-- Related migration:
-- 20260816_005_create_declarations_table.sql
-- =========================================================
--
-- Warning:
-- Running this rollback permanently deletes every issued academic
-- declaration record (enrollment/attendance/completion) -- an
-- audit trail, not just cache. The PDF files themselves (under
-- backend/storage/generated-documents/) are not deleted by this
-- script and must be cleaned up separately if truly intended.
-- =========================================================

USE coursehub_escola;

DROP TABLE IF EXISTS declarations;
