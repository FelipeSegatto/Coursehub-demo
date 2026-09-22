-- CourseHub
-- Rollback: create chat core tables
-- Date: 2026-08-06
-- Reverts: database/migrations/20260806_001_create_chat_core_tables.sql
--
-- Drops the circular FK first (chat_conversations.last_message_id ->
-- chat_messages), then drops in reverse dependency order (children
-- before parents) so the remaining foreign keys never block a drop.
--
-- Safe to run only if no application code depends on these tables
-- yet. Running this after real conversations/messages exist
-- permanently deletes them -- there is no soft-delete/archive path
-- for the tables themselves.

USE coursehub_escola;

ALTER TABLE chat_conversations DROP FOREIGN KEY fk_conversation_last_message;

DROP TABLE IF EXISTS chat_access_logs;
DROP TABLE IF EXISTS chat_reports;
DROP TABLE IF EXISTS chat_messages;
DROP TABLE IF EXISTS chat_participants;
DROP TABLE IF EXISTS chat_conversations;
