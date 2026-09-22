-- =========================================================
-- Migration: add class-change audit fields to enrollments
-- Date: 2026-08-03
-- Feature branch: feature/admin-academic-entities
-- =========================================================
--
-- Purpose:
-- Support POST /api/admin/enrollments/:id/change-class with a
-- minimal audit trail (reason, actor, timestamp), without
-- introducing a general-purpose audit log table in this phase.
--
-- Domain rule:
-- class_change_reason/class_changed_at/class_changed_by_user_id
-- stay NULL until the first explicit class change is made through
-- the admin flow. They are never set by the initial enrollment
-- creation.
--
-- Note:
-- class_changed_by_user_id mirrors the existing convention of
-- locked_by_user_id/reactivated_by_user_id on this same table:
-- a plain INT reference, no FK constraint.
-- =========================================================

USE coursehub_escola;

ALTER TABLE enrollments
  ADD COLUMN class_change_reason VARCHAR(500) NULL,
  ADD COLUMN class_changed_at DATETIME NULL,
  ADD COLUMN class_changed_by_user_id INT NULL;
