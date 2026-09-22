-- CourseHub
-- Migration: create completion_rules
-- Date: 2026-08-16
-- Feature: academic documents (declarations and certificates) -- Fase 2
-- MySQL: 8.0+
--
-- Purpose:
--   Versioned, per-course rules of what counts as "concluded" for the
--   purpose of issuing a certificate. Each criterion is independently
--   nullable: NULL means "not required for this course" (e.g. a
--   course with no class/sessions has nothing to compute attendance
--   from, so min_attendance_percentage stays NULL rather than forcing
--   a fake 0% requirement). backend/services/academic/enrollmentCompletionService.js
--   is the only reader; it never assumes a course is eligible when no
--   active rule exists for it -- evaluation fails loudly instead.
--
-- Domain rules:
--   - "Only one active version per course" is enforced in application
--     code (backend/services/academic/completionRuleService.js),
--     mirroring the exact same convention already used by
--     document_templates (status ENUM draft/active/retired, no DB
--     constraint for "only one active" -- see 20260816_001).
--   - A rule version, once used by an issued certificate
--     (certificates.completion_rule_id), is never edited -- changing
--     the criteria means inserting a new version row and activating
--     it, never UPDATE-ing an existing one's thresholds.
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   Requires a DB user with DDL privileges (CREATE).

USE coursehub_escola;

CREATE TABLE completion_rules (
  id INT NOT NULL AUTO_INCREMENT,

  course_id INT NOT NULL,
  version INT NOT NULL,

  min_content_progress_percentage DECIMAL(5,2) NULL,
  min_attendance_percentage DECIMAL(5,2) NULL,
  min_average_grade DECIMAL(5,2) NULL,
  require_all_mandatory_items BOOLEAN NOT NULL DEFAULT TRUE,

  status ENUM('draft', 'active', 'retired') NOT NULL DEFAULT 'draft',

  created_by_user_id INT NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  UNIQUE KEY uq_completion_rules_course_version (course_id, version),
  KEY idx_completion_rules_course_status (course_id, status),

  CONSTRAINT fk_completion_rules_course
    FOREIGN KEY (course_id)
    REFERENCES courses(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_completion_rules_created_by
    FOREIGN KEY (created_by_user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'completion_rules' AS table_name, COUNT(*) AS row_count FROM completion_rules;
