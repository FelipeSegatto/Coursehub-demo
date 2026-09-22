-- CourseHub
-- Rollback for: 20260813_001_add_pricing_plan_unique_name.sql
-- Date: 2026-08-13
-- MySQL: 8.0+

USE coursehub_escola;

ALTER TABLE course_pricing_plans
  DROP KEY uq_pricing_plan_course_name;
