-- Rollback of 20260918_005. Drops the FK/column first, then the table.
-- Does not delete files already written to disk.

USE coursehub_escola;

ALTER TABLE users
  DROP FOREIGN KEY fk_users_avatar_file;

ALTER TABLE users
  DROP COLUMN avatar_file_id;

DROP TABLE IF EXISTS uploaded_files;
