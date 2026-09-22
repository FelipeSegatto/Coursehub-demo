-- =========================================================
-- Rollback: remove 'withdrawn' from enrollments.status
-- Related migration:
-- 20260825_001_add_withdrawn_to_enrollments_status.sql
-- =========================================================
--
-- Warning:
-- Will FAIL if any row currently has status = 'withdrawn', since this
-- rollback restores the original 5-value enum. Check first:
--   SELECT COUNT(*) FROM enrollments WHERE status = 'withdrawn';
-- Those rows have no safe automatic remap ('cancelled' is the closest
-- existing semantic but loses the "student withdrew" distinction this
-- migration introduced) -- reassign manually first or skip this
-- rollback entirely.
-- =========================================================

USE coursehub_escola;

ALTER TABLE enrollments
  MODIFY COLUMN status
    ENUM('active', 'inactive', 'completed', 'cancelled', 'locked')
    NOT NULL;
