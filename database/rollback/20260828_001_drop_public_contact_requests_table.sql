-- =========================================================
-- Rollback: drop public_contact_requests
-- Related migration:
-- 20260828_001_create_public_contact_requests_table.sql
-- =========================================================
--
-- Safe to run at any time -- no other table has a foreign key into
-- public_contact_requests, and no other feature reads from it.
-- Dropping it loses only the history of public contact-form
-- submissions.
-- =========================================================

USE coursehub_escola;

DROP TABLE IF EXISTS public_contact_requests;
