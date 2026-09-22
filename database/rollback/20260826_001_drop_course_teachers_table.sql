-- =========================================================
-- Rollback: drop course_teachers
-- Related migration:
-- 20260826_001_create_course_teachers_table.sql
-- =========================================================
--
-- Safe to run at any time -- courses.teacher_id was never modified by
-- the feature this table supports, so dropping course_teachers loses
-- only the N:N membership history (which teachers, beyond the single
-- legacy courses.teacher_id, were ever linked to a course). No other
-- table has a foreign key into course_teachers.
-- =========================================================

USE coursehub_escola;

DROP TABLE IF EXISTS course_teachers;
