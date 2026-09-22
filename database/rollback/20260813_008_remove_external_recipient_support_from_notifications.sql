-- =========================================================
-- Rollback: remove external-recipient support from notification_recipients
-- Related migration:
-- 20260813_008_add_external_recipient_support_to_notifications.sql
-- =========================================================
--
-- Warning:
-- Will FAIL if any row currently has user_id IS NULL (an external
-- recipient already recorded). Check before running:
--   SELECT COUNT(*) FROM notification_recipients WHERE user_id IS NULL;
-- Those rows must be deleted (cascades their deliveries) before this
-- rollback can restore the NOT NULL constraint.
-- =========================================================

USE coursehub_escola;

ALTER TABLE notification_recipients
  DROP COLUMN external_email,
  DROP COLUMN external_name,
  MODIFY COLUMN user_id INT NOT NULL;
