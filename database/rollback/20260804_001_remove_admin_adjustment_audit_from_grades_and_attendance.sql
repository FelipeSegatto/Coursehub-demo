-- =========================================================
-- Rollback: remove admin adjustment audit fields from grades and attendance
-- Related migration:
-- 20260804_001_add_admin_adjustment_audit_to_grades_and_attendance.sql
-- =========================================================
--
-- Warning:
-- Running this rollback permanently removes the record of the last
-- administrative adjustment (previous value/reason/actor/timestamp)
-- made to any grade or attendance entry.
-- =========================================================

USE coursehub_escola;

ALTER TABLE grades
  DROP COLUMN previous_score,
  DROP COLUMN admin_adjustment_reason,
  DROP COLUMN admin_adjusted_by_user_id,
  DROP COLUMN admin_adjusted_at;

ALTER TABLE attendance
  DROP COLUMN previous_status,
  DROP COLUMN admin_adjustment_reason,
  DROP COLUMN admin_adjusted_by_user_id,
  DROP COLUMN admin_adjusted_at;
