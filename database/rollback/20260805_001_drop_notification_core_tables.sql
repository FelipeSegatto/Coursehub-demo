-- CourseHub
-- Rollback: create notification core tables
-- Date: 2026-08-05
-- Reverts: database/migrations/20260805_001_create_notification_core_tables.sql
--
-- Drops in reverse dependency order (children before parents) so
-- the foreign keys never block the drop.
--
-- Safe to run only if no application code depends on these tables
-- yet (i.e. before backend/services/notifications/* and
-- backend/workers/notificationEmailWorker.js are deployed). Running
-- this after real notifications exist permanently deletes them --
-- there is no soft-delete/archive path for the tables themselves.

USE coursehub_escola;

DROP TABLE IF EXISTS notification_deliveries;
DROP TABLE IF EXISTS notification_recipients;
DROP TABLE IF EXISTS notification_preferences;
DROP TABLE IF EXISTS notifications;
