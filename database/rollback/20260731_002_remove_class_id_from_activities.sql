USE coursehub_escola;

ALTER TABLE activities

DROP FOREIGN KEY fk_activity_class,

DROP INDEX idx_activity_scope,

DROP INDEX idx_activity_class_id,

DROP COLUMN class_id;