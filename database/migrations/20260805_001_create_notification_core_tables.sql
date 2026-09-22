-- CourseHub
-- Migration: create notification core tables
-- Date: 2026-08-05
-- Feature branch: feature/notifications-chat-etapa-1-schema-nucleo-notificacoes
-- MySQL: 8.0+
--
-- Purpose:
--   Stage 1 of the notifications + institutional chat master plan
--   (see project plan doc). Creates the four core tables for
--   in-app notifications and their async email delivery via a
--   transactional outbox. This migration does NOT touch chat
--   tables (those come in a later stage) and no application route
--   emits notification events yet -- this is schema + core service
--   scaffolding only.
--
-- Domain rules:
--   notifications is an immutable event log: a row is never
--   rewritten after creation (no updated_at column on purpose). A
--   change in the underlying fact (e.g. a due date moved) creates a
--   NEW notification row with its own deduplication_key, it never
--   mutates an existing one.
--
--   deduplication_key is the idempotency guard: the same logical
--   event (e.g. "activity 42 published") must resolve to the same
--   key on every attempt, so retried/duplicate producer calls never
--   create a second notification. Enforced by a UNIQUE constraint,
--   not just application logic.
--
--   notification_recipients materializes one row per (notification,
--   user) with its own read/archive state -- read state is never
--   stored on the notification itself, since a notification can
--   reach many users independently.
--
--   notification_deliveries tracks one row per (recipient, channel)
--   -- channel is 'email' only for now, modeled as a column (not an
--   enum) so a future channel can be added without a migration.
--   status/attempt_count/next_attempt_at/locked_at/locked_by exist
--   for the outbox worker (stage 3) to claim/retry/lease jobs; no
--   worker exists yet in this stage.
--
--   notification_preferences is opt-in/opt-out per category, email
--   only. Absence of a row for (user, category) means "use the
--   registry's default policy for that category" -- the application
--   layer decides the default, this table only stores overrides.
--
-- Adaptation notes (see plan doc for full reasoning):
--   - id is BIGINT on the three high-volume/unbounded-growth tables
--     (notifications, notification_recipients, notification_deliveries)
--     since this project's usual convention is plain INT
--     auto_increment; notification_preferences stays INT (project
--     default) since its cardinality is bounded by users x categories.
--   - notifications.actor_user_id/course_id/class_id use FK ON
--     DELETE RESTRICT, mirroring academic_calendar_events'
--     created_by_user_id/course_id/class_id -- a notification is a
--     historical record referencing these entities, not a child of
--     them.
--   - notification_recipients/notification_deliveries/
--     notification_preferences are true child/junction data of a
--     user (or of a notification), so they use ON DELETE CASCADE,
--     mirroring the enrollments/submissions-style parent-child
--     cascade already used elsewhere in this schema (not the
--     RESTRICT-style audit columns like admin_adjusted_by_user_id).
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   MySQL DDL statements perform implicit commits, so run this only
--   after a backup.

USE coursehub_escola;

CREATE TABLE notifications (
  id BIGINT NOT NULL AUTO_INCREMENT,

  type VARCHAR(80) NOT NULL,
  category VARCHAR(40) NOT NULL,
  priority ENUM('normal', 'high', 'urgent') NOT NULL DEFAULT 'normal',

  title VARCHAR(180) NOT NULL,
  message VARCHAR(700) NOT NULL,

  source_type VARCHAR(60) NOT NULL,
  source_id BIGINT NULL,

  actor_user_id INT NULL,
  course_id INT NULL,
  class_id INT NULL,

  deduplication_key VARCHAR(191) NOT NULL,
  metadata JSON NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  UNIQUE KEY uk_notification_dedup (deduplication_key),

  KEY idx_notification_type (type),
  KEY idx_notification_category (category),
  KEY idx_notification_course_class (course_id, class_id),
  KEY idx_notification_source (source_type, source_id),

  CONSTRAINT fk_notification_actor
    FOREIGN KEY (actor_user_id)
    REFERENCES users(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT fk_notification_course
    FOREIGN KEY (course_id)
    REFERENCES courses(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT fk_notification_class
    FOREIGN KEY (class_id)
    REFERENCES classes(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notification_recipients (
  id BIGINT NOT NULL AUTO_INCREMENT,

  notification_id BIGINT NOT NULL,
  user_id INT NOT NULL,

  action_path VARCHAR(255) NULL,

  read_at DATETIME NULL,
  archived_at DATETIME NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  UNIQUE KEY uk_recipient_notification_user (notification_id, user_id),

  KEY idx_recipient_inbox (user_id, archived_at, created_at),
  KEY idx_recipient_unread_count (user_id, archived_at, read_at),

  CONSTRAINT fk_recipient_notification
    FOREIGN KEY (notification_id)
    REFERENCES notifications(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  CONSTRAINT fk_recipient_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notification_deliveries (
  id BIGINT NOT NULL AUTO_INCREMENT,

  recipient_id BIGINT NOT NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'email',

  destination_snapshot VARCHAR(255) NULL,

  status ENUM('pending', 'processing', 'sent', 'failed', 'skipped')
    NOT NULL DEFAULT 'pending',

  attempt_count INT NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NULL,
  locked_at DATETIME NULL,
  locked_by VARCHAR(100) NULL,

  sent_at DATETIME NULL,
  provider_message_id VARCHAR(255) NULL,
  skip_reason VARCHAR(255) NULL,
  last_error VARCHAR(500) NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  UNIQUE KEY uk_delivery_recipient_channel (recipient_id, channel),

  KEY idx_delivery_worker_claim (status, next_attempt_at),

  CONSTRAINT fk_delivery_recipient
    FOREIGN KEY (recipient_id)
    REFERENCES notification_recipients(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notification_preferences (
  id INT NOT NULL AUTO_INCREMENT,

  user_id INT NOT NULL,
  category VARCHAR(40) NOT NULL,
  email_enabled TINYINT(1) NOT NULL DEFAULT 1,

  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  UNIQUE KEY uk_preference_user_category (user_id, category),

  CONSTRAINT fk_preference_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
