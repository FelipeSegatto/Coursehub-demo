-- CourseHub
-- Migration: drop admin_permissions
-- Date: 2026-10-02
--
-- Chat supervision is an admin role, not a grant between admins.
-- The table only ever stored chat supervision keys.

USE coursehub_escola;

DROP TABLE IF EXISTS admin_permissions;
