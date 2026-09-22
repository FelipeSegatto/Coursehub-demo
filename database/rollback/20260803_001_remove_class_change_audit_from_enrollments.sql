-- =========================================================
-- Rollback: remove class-change audit fields from enrollments
-- Related migration:
-- 20260803_001_add_class_change_audit_to_enrollments.sql
-- =========================================================
--
-- Warning:
-- Running this rollback permanently removes the class-change
-- audit trail (reason/actor/timestamp) stored on enrollments.
-- =========================================================

USE coursehub_escola;

ALTER TABLE enrollments
  DROP COLUMN class_changed_by_user_id,
  DROP COLUMN class_changed_at,
  DROP COLUMN class_change_reason;
