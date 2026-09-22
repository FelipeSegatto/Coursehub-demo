-- CourseHub
-- Migration: create course_teachers (N:N course <-> teacher membership)
-- Date: 2026-08-26
-- Feature: multiple teachers per course
-- MySQL: 8.0+
--
-- Purpose:
--   courses.teacher_id today models exactly one teacher per course. This
--   migration introduces the official N:N membership relation without
--   removing that column -- courses.teacher_id is kept as a compatibility
--   field and as a placeholder for a possible future "primary teacher /
--   course coordinator / department head" concept. No business rule or
--   frontend depends on courses.teacher_id being a "primary" teacher in
--   this version; every active row in course_teachers is an equal member
--   of the course, subject only to class-level ownership (classes.teacher_id,
--   unchanged, still single-teacher-per-class).
--
-- Domain rules:
--   - PRIMARY KEY (course_id, teacher_id): a teacher can only have one
--     membership row per course -- re-adding a removed teacher flips
--     status back to 'active' instead of inserting a duplicate row
--     (see backend/services/courses/courseTeacherService.js#syncCourseTeachers).
--   - status ENUM('active','inactive'), never deleted: removing a teacher
--     from a course sets status='inactive' instead of DELETE, preserving
--     the historical record of who was ever assigned to a course.
--   - ON DELETE RESTRICT on both FKs, matching classes.teacher_id's existing
--     RESTRICT policy (see classes.fk_classes_teacher) -- this project's
--     established pattern for "don't allow deleting a still-referenced
--     course/teacher out from under active academic relationships"
--     (courses itself has no hard DELETE path -- adminCourseService.js
--     only soft-deletes via status='archived' -- and teachers are only
--     soft-deactivated, never hard-deleted, so RESTRICT should never
--     actually fire in practice; it exists as a safety net, not a
--     workflow blocker).
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   Requires a DB user with DDL privileges (ALTER/CREATE).
--   MySQL DDL statements perform implicit commits, so run this only
--   after a backup.

USE coursehub_escola;

CREATE TABLE course_teachers (
  course_id INT NOT NULL,
  teacher_id INT NOT NULL,

  status ENUM('active', 'inactive')
    COLLATE utf8mb4_unicode_ci
    NOT NULL
    DEFAULT 'active',

  created_at DATETIME NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at DATETIME NOT NULL
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (course_id, teacher_id),

  KEY idx_course_teachers_teacher (teacher_id, status),
  KEY idx_course_teachers_course_status (course_id, status),

  CONSTRAINT fk_course_teachers_course
    FOREIGN KEY (course_id)
    REFERENCES courses(id)
    ON DELETE RESTRICT,

  CONSTRAINT fk_course_teachers_teacher
    FOREIGN KEY (teacher_id)
    REFERENCES teachers(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- BACKFILL: every course currently linked via courses.teacher_id keeps that
-- teacher's access after this migration -- no existing membership is lost.
-- -----------------------------------------------------------------------------

INSERT INTO course_teachers (course_id, teacher_id, status)
SELECT id, teacher_id, 'active'
FROM courses
WHERE teacher_id IS NOT NULL
ON DUPLICATE KEY UPDATE status = 'active';

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'course_teachers' AS table_name, COUNT(*) AS row_count FROM course_teachers;

-- Every course that had a non-null teacher_id must now have a matching
-- active course_teachers row -- this should return 0 rows.
SELECT c.id AS course_id, c.teacher_id
FROM courses c
LEFT JOIN course_teachers ct
  ON ct.course_id = c.id AND ct.teacher_id = c.teacher_id AND ct.status = 'active'
WHERE c.teacher_id IS NOT NULL AND ct.course_id IS NULL;
