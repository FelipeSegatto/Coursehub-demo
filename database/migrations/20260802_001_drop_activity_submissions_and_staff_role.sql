-- Migration: 20260802_001_drop_activity_submissions_and_staff_role
-- Purpose:
--   1. Drop `activity_submissions` — dead table, superseded by `submissions` + `grades`.
--      Confirmed zero rows and zero code references (backend, routes, services) before dropping.
--   2. Drop `staff` — dead table, no application code ever referenced it. Zero rows.
--   3. Remove 'manager' and 'staff' from `users.role` — neither value is used by any
--      authorization check or route in the backend, and no `users` row currently has
--      either role. `manager` was a planned-but-unbuilt role (unrouted RoleRoute,
--      empty DashboardGestor.jsx page).
--
-- This is the first migration tracked in this repository. No prior schema history
-- exists in version control; the schema before this point was only ever live in MySQL.

DROP TABLE IF EXISTS activity_submissions;

DROP TABLE IF EXISTS staff;

ALTER TABLE users
  MODIFY COLUMN role ENUM('admin', 'teacher', 'student') NOT NULL DEFAULT 'student';
