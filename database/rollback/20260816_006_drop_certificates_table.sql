-- =========================================================
-- Rollback: drop certificates
-- Related migration:
-- 20260816_006_create_certificates_table.sql
-- =========================================================
--
-- Warning:
-- Running this rollback permanently deletes every issued certificate
-- record, including each one's frozen eligibility_snapshot -- an
-- audit trail, not just cache. The PDF files themselves (under
-- backend/storage/generated-documents/) are not deleted by this
-- script and must be cleaned up separately if truly intended. Run
-- this before rolling back 20260816_004 (completion_rules), since
-- certificates.completion_rule_id references it.
-- =========================================================

USE coursehub_escola;

DROP TABLE IF EXISTS certificates;
