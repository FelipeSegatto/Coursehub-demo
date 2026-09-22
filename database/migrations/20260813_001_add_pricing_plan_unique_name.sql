-- CourseHub
-- Migration: Prevent duplicate pricing plan names within the same course
-- Date: 2026-08-13
-- MySQL: 8.0+
--
-- Purpose:
--   course_pricing_plans has no protection today against two plans in
--   the same course sharing a name (e.g. two "Pagamento à vista" rows
--   for course 1). The admin CRUD being introduced alongside this
--   migration already rejects duplicates at the application layer,
--   but a DB-level constraint is the real backstop against a race
--   between two concurrent admin requests.
--
-- Safety:
--   Verified against the live database before writing this migration
--   (SELECT course_id, name, COUNT(*) FROM course_pricing_plans GROUP BY
--   course_id, name HAVING COUNT(*) > 1) -- zero duplicates found across
--   the 8 existing rows. No data is renamed, merged, or deleted here.
--   This migration only adds a constraint; if a fresh environment ever
--   does have duplicates, this ALTER TABLE will fail loudly (MySQL
--   refuses to add a UNIQUE index over existing duplicate values)
--   instead of silently corrupting/dropping rows -- that failure is
--   the intended, safe outcome for this migration; resolving such
--   duplicates manually is a separate, deliberate decision, not an
--   automatic one.
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   MySQL DDL statements perform implicit commits, so run this only after a backup.

USE coursehub_escola;

ALTER TABLE course_pricing_plans
  ADD UNIQUE KEY uq_pricing_plan_course_name (course_id, name);

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'course_pricing_plans' AS table_name, COUNT(*) AS row_count FROM course_pricing_plans;
