-- CourseHub
-- Migration: allow notification_recipients without a user account
-- Date: 2026-08-13
-- Feature: administrative contracting flow -- billing emails to a
--          contracting party who may have no CourseHub login
-- MySQL: 8.0+
--
-- Purpose:
--   The notification/outbox system (notifications ->
--   notification_recipients -> notification_deliveries) was built
--   assuming every recipient is a system user (user_id NOT NULL).
--   The contracting-flow billing email must reach a contracting
--   party's billing email, which may not correspond to any users
--   row at all (a parent/company with no login). Rather than build a
--   second, competing outbox for this one case, this migration
--   widens the existing one: user_id becomes optional, and
--   external_name/external_email hold the destination when there is
--   no user account. Every other recipient (the overwhelming
--   majority) is unaffected -- user_id stays populated exactly as
--   before.
--
-- Domain rules:
--   - Exactly one of (user_id) or (external_email) is set per
--     recipient row -- enforced at the application layer
--     (notificationService.js), not by a CHECK constraint, to match
--     this schema's existing convention of application-level
--     invariants over DB-level CHECKs.
--   - External recipients never have a notification_preferences row
--     (preferences are keyed by user_id) -- they are always treated
--     as "essential" (no opt-out), since there is no account to hold
--     a preference against.
--   - uk_recipient_notification_user still allows multiple NULL
--     user_id rows for the same notification (MySQL unique keys
--     never collide on NULL), which is correct: a contract-billing
--     notification's dedup key already scopes it to one contract, so
--     there is at most one external recipient per such notification
--     in practice, but the constraint does not need to enforce that.
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   MySQL DDL statements perform implicit commits, so run this only
--   after a backup.

USE coursehub_escola;

ALTER TABLE notification_recipients
  MODIFY COLUMN user_id INT NULL,
  ADD COLUMN external_name VARCHAR(150) NULL AFTER user_id,
  ADD COLUMN external_email VARCHAR(150) NULL AFTER external_name;

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'notification_recipients' AS table_name, COUNT(*) AS row_count FROM notification_recipients;
