-- CourseHub
-- Migration: alive enrollment unique + pricing plan name unique + cancelled-contract repair
-- Date: 2026-09-18
-- MySQL: 8.0+
--
-- Purpose:
--   1. Repair enrollments still 'active' while the linked contract is
--      'cancelled' (access must follow the cancelled/withdrawn fact).
--   2. Replace uk_enrollment_student_course with a unique that allows
--      historical cancelled/withdrawn rows and at most one "alive"
--      enrollment per (student_id, course_id).
--   3. Apply uq_pricing_plan_course_name if a previous environment
--      never ran 20260813_001.
--
-- Alive statuses: active, inactive, locked, completed.
-- Historical: cancelled, withdrawn.

USE coursehub_escola;

UPDATE enrollments e
INNER JOIN financial_contracts fc ON fc.enrollment_id = e.id
SET
  e.status = CASE
    WHEN fc.cancellation_reason = 'student_withdrawal' THEN 'withdrawn'
    ELSE 'cancelled'
  END,
  e.updated_at = NOW()
WHERE e.status = 'active'
  AND fc.status = 'cancelled';

ALTER TABLE enrollments
  DROP INDEX uk_enrollment_student_course,
  ADD COLUMN alive_marker CHAR(1)
    GENERATED ALWAYS AS (
      CASE
        WHEN status IN ('cancelled', 'withdrawn') THEN NULL
        ELSE '1'
      END
    ) STORED,
  ADD UNIQUE KEY uk_enrollment_student_course_alive (student_id, course_id, alive_marker);

SET @pricing_unique_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'course_pricing_plans'
    AND INDEX_NAME = 'uq_pricing_plan_course_name'
);

SET @pricing_unique_sql := IF(
  @pricing_unique_exists = 0,
  'ALTER TABLE course_pricing_plans ADD UNIQUE KEY uq_pricing_plan_course_name (course_id, name)',
  'SELECT 1'
);

PREPARE pricing_unique_stmt FROM @pricing_unique_sql;
EXECUTE pricing_unique_stmt;
DEALLOCATE PREPARE pricing_unique_stmt;
