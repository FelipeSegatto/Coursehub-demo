-- CourseHub
-- Migration: create admin_permissions table
-- Date: 2026-08-07
-- Feature branch: feature/chat-institucional-etapa-12-supervisao-moderacao (Etapa 12)
-- MySQL: 8.0+
--
-- Purpose:
--   Etapa 12 of the notifications + institutional chat master plan.
--   role='admin' has been a binary flag everywhere so far (see
--   authenticateToken.js -- req.auth only ever carries {userId, role}).
--   Chat supervision/moderation needs finer authorization than that:
--   "an admin without the right permission cannot read a conversation
--   they're not a participant of" is a required, enforced case, not
--   a UI-only distinction. This table is the first piece of real
--   admin-permission granularity in the project.
--
-- Domain rules:
--   permission_key is free-form VARCHAR, not an ENUM -- new keys get
--   added by future stages (financial.audit, academic.audit, etc.)
--   without a schema change. Etapa 12 itself only grants/checks four
--   chat-scoped keys: chat.supervise_teacher_support,
--   chat.supervise_administrative_support, chat.supervise_staff_support,
--   chat.audit_access (the last one is the "extraordinary access to
--   any conversation" override, independent of modality).
--
--   revoked_at NULL means the grant is currently active. There is no
--   DB-level UNIQUE(user_id, permission_key) -- MySQL 8.0 has no
--   partial/filtered unique index, and a real UNIQUE across the whole
--   column pair would block re-granting a permission after it was
--   revoked (the revoked row would still occupy the constraint).
--   "no two simultaneously active grants for the same user+key" is
--   enforced at the application layer instead, the same tradeoff
--   already made for notification_preferences-style active-row
--   uniqueness elsewhere in this project.
--
--   granted_by_user_id is FK ON DELETE RESTRICT, not CASCADE --
--   who granted a permission is audit trail, and must not silently
--   disappear if that admin's account is later deleted. user_id (the
--   grantee) is CASCADE: if the account itself is gone, the
--   permission has nothing left to apply to.
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   MySQL DDL statements perform implicit commits, so run this only
--   after a backup.

USE coursehub_escola;

CREATE TABLE admin_permissions (
  id INT NOT NULL AUTO_INCREMENT,

  user_id INT NOT NULL,
  permission_key VARCHAR(60) NOT NULL,

  granted_by_user_id INT NOT NULL,
  granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  KEY idx_permission_lookup (user_id, permission_key, revoked_at),
  KEY idx_permission_granted_by (granted_by_user_id),

  CONSTRAINT fk_permission_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  CONSTRAINT fk_permission_granted_by
    FOREIGN KEY (granted_by_user_id)
    REFERENCES users(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
