-- CourseHub
-- Rollback: create academic_calendar_events
-- Date: 2026-08-01
-- Reverts: database/migrations/20260801_001_create_academic_calendar_events.sql
--
-- Safe to run only if no application code depends on this table yet
-- (i.e. before backend/services/calendar/* is deployed).

USE coursehub_escola;

DROP TABLE IF EXISTS academic_calendar_events;
