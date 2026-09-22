-- =========================================================
-- Rollback: recreate legacy certificates/declarations tables
-- Related migration:
-- 20260816_003_drop_legacy_untracked_certificates_and_declarations_tables.sql
-- =========================================================
--
-- Warning:
-- This recreates the OLD, unreferenced, incompatible shape (exact
-- SHOW CREATE TABLE captured before the drop) purely for structural
-- reversibility. It does not restore any data (there was none -- both
-- tables were confirmed empty) and nothing in the application will
-- read from or write to these tables even after this rollback runs.
-- Only run this if you are reverting the entire Fase 2 migration
-- chain in order (certificates/declarations of Fase 2 must be dropped
-- first, since they reuse these table names).
-- =========================================================

USE coursehub_escola;

CREATE TABLE `certificates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `student_id` int NOT NULL,
  `course_id` int NOT NULL,
  `certificate_code` varchar(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `workload_hours` int NOT NULL DEFAULT '0',
  `final_score` decimal(5,2) DEFAULT NULL,
  `status` enum('issued','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'issued',
  `issued_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `certificate_code` (`certificate_code`),
  KEY `fk_certificates_student` (`student_id`),
  KEY `fk_certificates_course` (`course_id`),
  CONSTRAINT `fk_certificates_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_certificates_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `declarations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `student_id` int NOT NULL,
  `course_id` int DEFAULT NULL,
  `requested_by_user_id` int DEFAULT NULL,
  `declaration_type` enum('enrollment','attendance','completion','custom') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'enrollment',
  `title` varchar(180) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('draft','issued','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'issued',
  `issued_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_declarations_student` (`student_id`),
  KEY `fk_declarations_course` (`course_id`),
  KEY `fk_declarations_user` (`requested_by_user_id`),
  CONSTRAINT `fk_declarations_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_declarations_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_declarations_user` FOREIGN KEY (`requested_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
