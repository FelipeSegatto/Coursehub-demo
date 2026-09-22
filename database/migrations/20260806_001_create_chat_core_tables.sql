-- CourseHub
-- Migration: create chat core tables
-- Date: 2026-08-06
-- Feature branch: feature/notifications-chat-etapa-5d-submissoes-notas-frequencia (Etapa 7)
-- MySQL: 8.0+
--
-- Purpose:
--   Etapa 7 of the notifications + institutional chat master plan.
--   Schema and base authorization model for the chat subsystem: five
--   tables covering all four modalities (academic_peer,
--   teacher_support, administrative_support, staff_support) from the
--   start, even though only the personal/generic services and no
--   per-modality "open a conversation" route exist yet -- those are
--   built incrementally in Etapas 8-11. This migration does not
--   touch the notifications tables (created in Etapa 1) and no
--   application route reads/writes these tables yet beyond what
--   Etapa 7's own services exercise directly.
--
-- Domain rules:
--   chat_conversations.type/channel_kind/status/priority already
--   cover the full vocabulary needed by every future chat etapa, to
--   avoid a new migration per modality stage. status includes all of
--   open/waiting_staff/waiting_student/waiting_teacher/waiting_admin/
--   resolved/closed even though only a subset is reachable before
--   Etapa 9-11 build the transitions that produce them.
--
--   category is a free-form VARCHAR, not an ENUM: each modality (and
--   each future stage) has its own category vocabulary (teacher_
--   support topics vs. administrative_support categories vs. staff_
--   support categories), validated at the application layer per
--   modality rather than combined into one unwieldy DB-level enum
--   that would need altering every time a category is added.
--
--   Messages are never hard-deleted -- deleted_at/deleted_by_user_id
--   implement the soft-delete-to-placeholder behavior the master
--   prompt requires (participants see a placeholder, the original
--   stays visible only to authorized supervision, built in Etapa 12).
--
--   client_message_id + sender_user_id is the idempotency guard for
--   optimistic sends: a repeated send from the same sender with the
--   same client id returns the existing message instead of creating
--   a duplicate, enforced by a UNIQUE constraint (not just
--   application logic), same pattern as notifications.deduplication_key.
--
--   last_read_message_id on chat_participants is a soft
--   high-water-mark pointer, not a real FK -- unlike last_message_id
--   below, it is not the kind of "one true circular reference" that
--   needs enforcement; treating it as unenforced avoids a second
--   circular-FK dance for a column that is only ever compared, never
--   joined for data integrity.
--
-- Adaptation notes (see plan doc for full reasoning):
--   - chat_messages.id is BIGINT (the one genuinely high-volume/
--     unbounded-growth table here, same reasoning as notifications.id
--     in Etapa 1); the other four tables stay INT (project default),
--     since their cardinality is bounded by conversations/
--     participants/reports/audit events, not raw message volume.
--   - Structural identity columns (created_by_user_id, assigned_
--     user_id, chat_participants.user_id, chat_messages.sender_
--     user_id, chat_reports.reporter_user_id/reviewed_by_user_id,
--     chat_access_logs.admin_user_id) use FK ON DELETE RESTRICT,
--     mirroring academic_calendar_events.created_by_user_id -- these
--     are structural to the entity, not optional audit metadata.
--   - True child/junction data (chat_participants.conversation_id,
--     chat_messages.conversation_id, chat_reports.message_id) uses
--     ON DELETE CASCADE, mirroring notification_recipients'
--     relationship to notifications.
--   - chat_access_logs.conversation_id is RESTRICT, not CASCADE --
--     this is audit data that must never silently vanish, even
--     though conversations are never hard-deleted in practice either
--     (belt and suspenders, matching admin_access being an audit
--     trail, not a child record).
--   - The chat_conversations <-> chat_messages circular reference
--     (a conversation points at its last message; a message points
--     at its conversation) is resolved by creating chat_conversations
--     WITHOUT the last_message_id foreign key first, then
--     chat_messages, then adding the circular FK via ALTER TABLE at
--     the end. Rollback removes that FK first, then drops in reverse
--     dependency order.
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   MySQL DDL statements perform implicit commits, so run this only
--   after a backup.

USE coursehub_escola;

CREATE TABLE chat_conversations (
  id INT NOT NULL AUTO_INCREMENT,

  type ENUM('academic_peer', 'teacher_support', 'administrative_support', 'staff_support')
    NOT NULL,
  channel_kind ENUM('direct', 'group', 'ticket') NOT NULL,

  title VARCHAR(180) NULL,
  category VARCHAR(60) NULL,

  course_id INT NULL,
  class_id INT NULL,

  created_by_user_id INT NOT NULL,
  initiator_role ENUM('student', 'teacher', 'admin') NOT NULL,
  assigned_user_id INT NULL,

  priority ENUM('normal', 'high', 'urgent') NOT NULL DEFAULT 'normal',
  status ENUM('open', 'waiting_staff', 'waiting_student', 'waiting_teacher', 'waiting_admin', 'resolved', 'closed')
    NOT NULL DEFAULT 'open',

  conversation_key VARCHAR(191) NULL,

  last_message_id BIGINT NULL,
  last_message_at DATETIME NULL,

  first_response_due_at DATETIME NULL,
  resolved_at DATETIME NULL,
  closed_at DATETIME NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  UNIQUE KEY uk_conversation_key (conversation_key),

  KEY idx_conversation_type_status (type, status),
  KEY idx_conversation_assigned (assigned_user_id, status),
  KEY idx_conversation_scope (course_id, class_id),
  KEY idx_conversation_created_by (created_by_user_id),

  CONSTRAINT fk_conversation_created_by
    FOREIGN KEY (created_by_user_id)
    REFERENCES users(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT fk_conversation_assigned
    FOREIGN KEY (assigned_user_id)
    REFERENCES users(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT fk_conversation_course
    FOREIGN KEY (course_id)
    REFERENCES courses(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT fk_conversation_class
    FOREIGN KEY (class_id)
    REFERENCES classes(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE chat_participants (
  id INT NOT NULL AUTO_INCREMENT,

  conversation_id INT NOT NULL,
  user_id INT NOT NULL,
  participant_role ENUM('student', 'teacher', 'admin', 'moderator') NOT NULL,

  last_read_message_id BIGINT NULL,

  joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  left_at DATETIME NULL,
  muted_at DATETIME NULL,
  archived_at DATETIME NULL,

  can_post TINYINT(1) NOT NULL DEFAULT 1,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  UNIQUE KEY uk_participant_conversation_user (conversation_id, user_id),

  KEY idx_participant_user (user_id, archived_at),

  CONSTRAINT fk_participant_conversation
    FOREIGN KEY (conversation_id)
    REFERENCES chat_conversations(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  CONSTRAINT fk_participant_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE chat_messages (
  id BIGINT NOT NULL AUTO_INCREMENT,

  conversation_id INT NOT NULL,
  sender_user_id INT NULL,
  reply_to_message_id BIGINT NULL,

  client_message_id VARCHAR(100) NULL,
  message_type ENUM('text', 'system') NOT NULL DEFAULT 'text',
  body TEXT NOT NULL,

  edited_at DATETIME NULL,
  deleted_at DATETIME NULL,
  deleted_by_user_id INT NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  UNIQUE KEY uk_message_sender_client_id (sender_user_id, client_message_id),

  KEY idx_message_conversation_cursor (conversation_id, id),
  KEY idx_message_reply_to (reply_to_message_id),

  CONSTRAINT fk_message_conversation
    FOREIGN KEY (conversation_id)
    REFERENCES chat_conversations(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  CONSTRAINT fk_message_sender
    FOREIGN KEY (sender_user_id)
    REFERENCES users(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT fk_message_reply_to
    FOREIGN KEY (reply_to_message_id)
    REFERENCES chat_messages(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT fk_message_deleted_by
    FOREIGN KEY (deleted_by_user_id)
    REFERENCES users(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE chat_reports (
  id INT NOT NULL AUTO_INCREMENT,

  message_id BIGINT NOT NULL,
  reporter_user_id INT NOT NULL,

  reason VARCHAR(60) NOT NULL,
  details VARCHAR(500) NULL,

  status ENUM('open', 'reviewing', 'resolved', 'dismissed') NOT NULL DEFAULT 'open',
  reviewed_by_user_id INT NULL,
  resolution_note VARCHAR(500) NULL,
  resolved_at DATETIME NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  UNIQUE KEY uk_report_message_reporter (message_id, reporter_user_id),

  KEY idx_report_status (status),

  CONSTRAINT fk_report_message
    FOREIGN KEY (message_id)
    REFERENCES chat_messages(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  CONSTRAINT fk_report_reporter
    FOREIGN KEY (reporter_user_id)
    REFERENCES users(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT fk_report_reviewed_by
    FOREIGN KEY (reviewed_by_user_id)
    REFERENCES users(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE chat_access_logs (
  id INT NOT NULL AUTO_INCREMENT,

  admin_user_id INT NOT NULL,
  conversation_id INT NOT NULL,

  access_reason ENUM('report_review', 'support', 'academic_audit', 'financial_audit', 'safety', 'other')
    NOT NULL,
  details VARCHAR(500) NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  KEY idx_access_log_conversation (conversation_id, created_at),
  KEY idx_access_log_admin (admin_user_id, created_at),

  CONSTRAINT fk_access_log_admin
    FOREIGN KEY (admin_user_id)
    REFERENCES users(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,

  CONSTRAINT fk_access_log_conversation
    FOREIGN KEY (conversation_id)
    REFERENCES chat_conversations(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- Circular reference, added last: a conversation's "last message"
-- pointer can only be constrained once chat_messages exists.
ALTER TABLE chat_conversations
  ADD CONSTRAINT fk_conversation_last_message
    FOREIGN KEY (last_message_id)
    REFERENCES chat_messages(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE;
