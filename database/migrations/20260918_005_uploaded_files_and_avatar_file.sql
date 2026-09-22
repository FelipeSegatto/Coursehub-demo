-- CourseHub
-- Migration: uploaded_files + users.avatar_file_id
-- Date: 2026-09-18
-- Feature: profile avatars, student submissions, staff/teacher materials
-- MySQL: 8.0+
--
-- Purpose:
--   Registry of user-uploaded files stored outside express.static.
--   users.avatar_file_id points at a custom photo; catalog avatars
--   continue to live in users.avatar_key (feminine-01 / masculine-01).
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   Requires a DB user with DDL privileges (CREATE, ALTER).

USE coursehub_escola;

CREATE TABLE uploaded_files (
  id INT NOT NULL AUTO_INCREMENT,
  owner_user_id INT NOT NULL,
  purpose ENUM('avatar', 'submission', 'course_material') NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  storage_key VARCHAR(255) NOT NULL DEFAULT '',
  status ENUM('active', 'deleted') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_uploaded_files_owner_purpose (owner_user_id, purpose, status),
  CONSTRAINT fk_uploaded_files_owner
    FOREIGN KEY (owner_user_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE users
  ADD COLUMN avatar_file_id INT NULL AFTER avatar_key,
  ADD CONSTRAINT fk_users_avatar_file
    FOREIGN KEY (avatar_file_id) REFERENCES uploaded_files(id)
    ON DELETE SET NULL;

SELECT 'uploaded_files' AS table_name, COUNT(*) AS row_count FROM uploaded_files;
