-- CourseHub
-- Migration: create public_contact_requests
-- Date: 2026-08-28
-- Feature: admin notifications evolution -- public contact form
-- MySQL: 8.0+
--
-- Purpose:
--   Persists submissions from the public "Fale conosco" form on
--   ContactPage.jsx (POST /api/public/contact). No CourseHub entity
--   equivalent to this existed before -- confirmed by grep across
--   database/migrations, backend/routes and backend/services prior to
--   writing this migration. Deliberately minimal (no CRM-style fields,
--   no attachments, no threading) -- see docs/admin-notifications-and-indicators.md.
--
-- Domain rules:
--   - status ENUM('new','read','resolved'), starts 'new'. An admin
--     marks it read/resolved from the simple /admin/contatos listing;
--     there is no assignment concept (unlike administrative_support
--     tickets) since this is not a two-way conversation.
--   - phone is nullable (optional field on the public form).
--   - No FK to users/students -- a contact submission is anonymous by
--     design; the sender may not have (or ever create) a CourseHub
--     account.
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   Requires a DB user with DDL privileges (ALTER/CREATE).
--   MySQL DDL statements perform implicit commits, so run this only
--   after a backup.

USE coursehub_escola;

CREATE TABLE public_contact_requests (
  id INT NOT NULL AUTO_INCREMENT,

  name VARCHAR(150)
    COLLATE utf8mb4_unicode_ci
    NOT NULL,

  email VARCHAR(150)
    COLLATE utf8mb4_unicode_ci
    NOT NULL,

  phone VARCHAR(30)
    COLLATE utf8mb4_unicode_ci
    NULL,

  subject VARCHAR(180)
    COLLATE utf8mb4_unicode_ci
    NOT NULL,

  message VARCHAR(2000)
    COLLATE utf8mb4_unicode_ci
    NOT NULL,

  status ENUM('new', 'read', 'resolved')
    COLLATE utf8mb4_unicode_ci
    NOT NULL
    DEFAULT 'new',

  created_at DATETIME NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  updated_at DATETIME NOT NULL
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  KEY idx_public_contact_requests_status (status, created_at),
  KEY idx_public_contact_requests_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'public_contact_requests' AS table_name, COUNT(*) AS row_count FROM public_contact_requests;
