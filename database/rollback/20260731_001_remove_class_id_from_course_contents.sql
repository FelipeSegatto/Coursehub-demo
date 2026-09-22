-- =========================================================
-- Rollback: remove class scope from course contents
-- Related migration:
-- 20260731_001_add_class_id_to_course_contents.sql
-- =========================================================
--
-- Warning:
-- Running this rollback permanently removes the class_id
-- associations stored in course_contents.
-- Export or preserve those relationships before execution.
-- =========================================================

USE coursehub_escola;

ALTER TABLE course_contents
  DROP FOREIGN KEY fk_course_contents_class,
  DROP INDEX idx_course_contents_scope,
  DROP INDEX idx_course_contents_class_id,
  DROP COLUMN class_id;