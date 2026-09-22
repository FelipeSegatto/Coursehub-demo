-- =========================================================
-- Rollback: remove origin/creation-audit columns from enrollments
-- Related migration:
-- 20260813_007_add_origin_columns_to_enrollments.sql
-- =========================================================
--
-- Warning:
-- Permanently discards the origin/created_by_user_id/activated_at
-- audit trail for every enrollment. The enrollments themselves are
-- untouched.
-- =========================================================

USE coursehub_escola;

ALTER TABLE enrollments
  DROP FOREIGN KEY fk_enrollments_created_by,
  DROP COLUMN activated_at,
  DROP COLUMN created_by_user_id,
  DROP COLUMN origin;
