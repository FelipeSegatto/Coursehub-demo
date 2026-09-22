-- CourseHub
-- Rollback: drop admin_permissions table
-- Pairs with: 20260807_001_create_admin_permissions_table.sql
-- MySQL: 8.0+
--
-- Important:
--   MySQL DDL statements perform implicit commits, so run this only
--   after a backup. This permanently deletes every permission grant.

USE coursehub_escola;

DROP TABLE IF EXISTS admin_permissions;
