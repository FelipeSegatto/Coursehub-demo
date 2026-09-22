-- CourseHub
-- Migration: drop legacy untracked certificates/declarations tables
-- Date: 2026-08-16
-- Feature: academic documents (declarations and certificates) -- Fase 2
-- MySQL: 8.0+
--
-- Purpose:
--   `certificates` and `declarations` already existed in the live
--   database with no corresponding migration file anywhere in
--   database/migrations (predate the migration-tracked era of this
--   schema) and zero references in application code. Confirmed live
--   before writing this migration: both tables have 0 rows, and no
--   other table has a foreign key pointing at either of them
--   (information_schema.KEY_COLUMN_USAGE query, empty result).
--
--   Their shape is also incompatible with the shared document
--   generation infrastructure built in Fase 0/1
--   (document_templates/generated_documents): the old `declarations`
--   stored rendered title/body text directly instead of linking to a
--   generated PDF, and neither table has a verification_code, a link
--   to generated_documents, or a link to a versioned completion rule.
--
--   Rather than reuse or ALTER an incompatible, unreferenced, empty
--   legacy pair, this migration drops them so the properly-designed,
--   migration-tracked replacements (completion_rules, declarations,
--   certificates -- see the migrations immediately following this one)
--   can use the same table names without a collision.
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   Requires a DB user with DDL privileges (DROP).
--   Safe only because both tables are confirmed empty and unreferenced
--   as of this migration's authoring -- re-verify before running this
--   against any environment where that might no longer hold.

USE coursehub_escola;

DROP TABLE IF EXISTS certificates;
DROP TABLE IF EXISTS declarations;
