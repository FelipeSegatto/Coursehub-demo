-- =========================================================
-- Migration: add class scope to activities
-- Date: 2026-07-31
-- Feature branch: feature/class-scoped-learning-content
-- =========================================================
--
-- Purpose:
-- Allow activities and assessments to be:
--
-- 1. shared by every class of the course
-- 2. exclusive to a specific class
--
-- Domain rule:
--
-- class_id IS NULL
-- -> shared activity
--
-- class_id IS NOT NULL
-- -> activity exclusive to that class
--
-- Existing records:
--
-- Existing activities remain with class_id = NULL,
-- preserving the previous behaviour.
--
-- Important:
--
-- The application layer must validate:
--
-- classes.course_id = activities.course_id
--
-- =========================================================

USE coursehub_escola;

ALTER TABLE activities
    ADD COLUMN class_id INT NULL AFTER course_id,

    ADD KEY idx_activity_class_id (class_id),

    ADD KEY idx_activity_scope (
        course_id,
        class_id,
        status,
        activity_kind
    ),

    ADD CONSTRAINT fk_activity_class
        FOREIGN KEY (class_id)
        REFERENCES classes(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE;