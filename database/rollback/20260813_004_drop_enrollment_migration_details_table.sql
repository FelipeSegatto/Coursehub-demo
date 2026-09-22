-- =========================================================
-- Rollback: drop enrollment_migration_details
-- Related migration:
-- 20260813_004_create_enrollment_migration_details_table.sql
-- =========================================================
--
-- Warning:
-- Running this rollback permanently removes the migration audit
-- trail (source system, legacy id, original date, notes) for every
-- enrollment imported through "Matricula por migracao". The
-- enrollments themselves are untouched.
-- =========================================================

USE coursehub_escola;

DROP TABLE IF EXISTS enrollment_migration_details;
