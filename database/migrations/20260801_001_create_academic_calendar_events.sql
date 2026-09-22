-- CourseHub
-- Migration: create academic_calendar_events
-- Date: 2026-08-01
-- Feature branch: feature/academic-calendar
-- MySQL: 8.0+
--
-- Purpose:
--   Store only calendar events that do not have an owning entity in
--   another module (holidays, breaks, recess, exam week, academic week,
--   enrollment/re-enrollment windows, grade-submission deadlines,
--   academic meetings, institutional events).
--
-- Explicitly out of scope for this table:
--   activities, exams, course_contents, class_sessions, submissions,
--   grades. Those remain sourced live from their own tables by the
--   calendar aggregation service (see backend/services/calendar/).
--
-- Domain rule (scope_type):
--   institutional | all_students | all_teachers
--     -> course_id and class_id stay NULL.
--   course
--     -> course_id required, class_id NULL.
--   class
--     -> course_id and class_id required; the application layer must
--        validate that classes.course_id = course_id (same pattern
--        already used by assertClassBelongsToCourseAndTeacher for
--        activities/course_contents).
--
--   'management' (gestor role) is intentionally NOT part of this
--   enum yet -- the manager role has no authorization scaffolding in
--   the app today (see docs/knownissues.txt). Add it via a future
--   migration once that role is formalized.
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   MySQL DDL statements perform implicit commits, so run this only
--   after a backup.

USE coursehub_escola;

CREATE TABLE academic_calendar_events (
  id INT NOT NULL AUTO_INCREMENT,

  event_type ENUM(
    'holiday',
    'break',
    'recess',
    'exam_week',
    'academic_week',
    'enrollment',
    're_enrollment',
    'grade_deadline',
    'academic_meeting',
    'institutional'
  ) NOT NULL,

  title VARCHAR(180) NOT NULL,
  description TEXT NULL,

  start_date DATE NOT NULL,
  end_date DATE NULL,
  all_day TINYINT(1) NOT NULL DEFAULT 1,
  start_time TIME NULL,
  end_time TIME NULL,

  scope_type ENUM(
    'institutional',
    'all_students',
    'all_teachers',
    'course',
    'class'
  ) NOT NULL,

  course_id INT NULL,
  class_id INT NULL,

  status ENUM('active', 'cancelled') NOT NULL DEFAULT 'active',

  created_by_user_id INT NOT NULL,
  cancelled_at DATETIME NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  KEY idx_calendar_event_scope (scope_type, course_id, class_id),
  KEY idx_calendar_event_dates (start_date, end_date),
  KEY idx_calendar_event_status (status),

  CONSTRAINT fk_calendar_event_course
    FOREIGN KEY (course_id)
    REFERENCES courses(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT fk_calendar_event_class
    FOREIGN KEY (class_id)
    REFERENCES classes(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT fk_calendar_event_created_by
    FOREIGN KEY (created_by_user_id)
    REFERENCES users(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
