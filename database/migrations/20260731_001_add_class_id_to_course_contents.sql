-- =========================================================
-- Migration: add class scope to course contents
-- Date: 2026-07-31
-- Feature branch: feature/class-scoped-learning-content
-- =========================================================
--
-- Purpose:
-- Allow a course content item to be either:
-- 1. shared by all classes of its course; or
-- 2. restricted to a specific class.
--
-- Domain rule:
-- class_id IS NULL     -> content shared by all course classes
-- class_id IS NOT NULL -> content exclusive to that class
--
-- Existing records:
-- Existing course_contents rows remain with class_id = NULL
-- and preserve their current visibility.
--
-- Important:
-- The application layer must validate that classes.course_id
-- matches course_contents.course_id.
-- =========================================================

USE coursehub_escola;

ALTER TABLE course_contents
  ADD COLUMN class_id INT NULL AFTER course_id,
  ADD KEY idx_course_contents_class_id (class_id),
  ADD KEY idx_course_contents_scope (
    course_id,
    class_id,
    status,
    type
  ),
  ADD CONSTRAINT fk_course_contents_class
    FOREIGN KEY (class_id)
    REFERENCES classes(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE;