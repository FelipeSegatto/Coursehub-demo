-- CourseHub
-- Migration: make financial_events.financial_contract_id optional
-- Date: 2026-08-13
-- Feature: administrative contracting flow -- account activation events
-- MySQL: 8.0+
--
-- Purpose:
--   Account-activation events (invitation created/resent, manual
--   link generated, previous tokens invalidated, account activated)
--   are about a USER's access, not necessarily about one specific
--   financial_contract -- a student with an active enrollment created
--   through a contract-less path (e.g. a future full-scholarship
--   enrollment) can still trigger these events. financial_events
--   already has a nullable enrollment_id column that IS always
--   available in every account-activation code path (eligibility
--   requires an active enrollment) -- this migration lets those
--   events anchor on enrollment_id alone when no contract applies,
--   instead of forcing a possibly-nonexistent contract reference.
--
-- Compatibility:
--   Every existing row already has a non-null financial_contract_id
--   and keeps it -- this migration only removes the NOT NULL
--   constraint, it does not touch any existing data.
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   Requires a DB user with DDL privileges (ALTER).

USE coursehub_escola;

ALTER TABLE financial_events
  MODIFY COLUMN financial_contract_id INT NULL;

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'financial_events' AS table_name, COUNT(*) AS row_count FROM financial_events;
