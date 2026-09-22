-- =========================================================
-- Migration: add admin adjustment audit fields to grades and attendance
-- Date: 2026-08-04
-- Feature branch: feature/admin-grades-attendance
-- =========================================================
--
-- Purpose:
-- Support administrative corrections to an already-graded submission
-- or an already-recorded attendance entry with a minimal audit trail
-- (previous value, reason, actor, timestamp), without introducing a
-- general-purpose audit log table in this phase.
--
-- Domain rule:
-- admin_adjusted_at/admin_adjusted_by_user_id/admin_adjustment_reason/
-- previous_score (or previous_status) stay NULL until the first
-- explicit administrative adjustment is made through the admin flow.
-- The normal teacher grading/attendance flow never touches these
-- columns. Only the LAST administrative adjustment is kept — this is
-- not a full multi-version history, matching the fact that no table
-- in this schema keeps multi-version history today either.
--
-- Note:
-- admin_adjusted_by_user_id mirrors the existing convention of
-- locked_by_user_id/reactivated_by_user_id (enrollments) and
-- class_changed_by_user_id (enrollments, added in
-- 20260803_001_add_class_change_audit_to_enrollments.sql): a plain
-- INT reference, no FK constraint.
-- =========================================================

USE coursehub_escola;

ALTER TABLE grades
  ADD COLUMN admin_adjusted_at DATETIME NULL,
  ADD COLUMN admin_adjusted_by_user_id INT NULL,
  ADD COLUMN admin_adjustment_reason VARCHAR(500) NULL,
  ADD COLUMN previous_score DECIMAL(5,2) NULL;

ALTER TABLE attendance
  ADD COLUMN admin_adjusted_at DATETIME NULL,
  ADD COLUMN admin_adjusted_by_user_id INT NULL,
  ADD COLUMN admin_adjustment_reason VARCHAR(500) NULL,
  ADD COLUMN previous_status ENUM('present','absent','late','excused') NULL;
