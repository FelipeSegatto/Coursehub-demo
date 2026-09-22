-- CourseHub
-- Migration: create contracting_parties and student_contracting_parties
-- Date: 2026-08-13
-- Feature: administrative contracting flow (contratante, cobranca,
--          ativacao automatica de matricula, convite de acesso)
-- MySQL: 8.0+
--
-- Purpose:
--   A "contracting party" (responsavel financeiro) is who a
--   financial_contract is actually billed to -- it may be the
--   student themselves ('self'), or a third party (parent, guardian,
--   company) who has no student/teacher/admin role of their own.
--   user_id is therefore optional: a contracting party is not
--   required to have a CourseHub login.
--
-- Domain rules:
--   - UNIQUE(document_type, document_number): the same CPF/CNPJ is
--     always the same contracting party, never duplicated.
--   - UNIQUE(user_id): when a contracting party IS linked to a user
--     account, that user has at most one contracting-party record
--     (MySQL unique keys allow multiple NULLs, so parties without a
--     user_id never collide with each other).
--   - student_contracting_parties is the join table: a student can
--     have more than one contracting party over time (e.g. changed
--     financial responsible), and a contracting party (a company,
--     for instance) can pay for more than one student.
--   - No physical deletion of a contracting party in this phase --
--     status ('active'/'inactive') is the only lifecycle column.
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   MySQL DDL statements perform implicit commits, so run this only
--   after a backup.

USE coursehub_escola;

CREATE TABLE contracting_parties (
  id INT NOT NULL AUTO_INCREMENT,

  user_id INT NULL,

  party_type ENUM('individual', 'company') NOT NULL,
  name VARCHAR(150) NOT NULL,

  document_type ENUM('cpf', 'cnpj', 'other') NOT NULL,
  document_number VARCHAR(30) NOT NULL,

  email VARCHAR(150) NOT NULL,
  phone VARCHAR(30) NULL,

  billing_address_line VARCHAR(255) NULL,
  billing_address_city VARCHAR(100) NULL,
  billing_address_state VARCHAR(2) NULL,
  billing_address_zip_code VARCHAR(20) NULL,

  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  UNIQUE KEY uq_contracting_party_document (document_type, document_number),
  UNIQUE KEY uq_contracting_party_user (user_id),

  KEY idx_contracting_party_status (status),

  CONSTRAINT fk_contracting_party_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE student_contracting_parties (
  id INT NOT NULL AUTO_INCREMENT,

  student_id INT NOT NULL,
  contracting_party_id INT NOT NULL,

  relationship_type ENUM('self', 'parent', 'guardian', 'company', 'other') NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  UNIQUE KEY uq_student_contracting_party (student_id, contracting_party_id),

  KEY idx_student_contracting_party_student (student_id),
  KEY idx_student_contracting_party_party (contracting_party_id),

  CONSTRAINT fk_student_contracting_party_student
    FOREIGN KEY (student_id)
    REFERENCES students(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  CONSTRAINT fk_student_contracting_party_party
    FOREIGN KEY (contracting_party_id)
    REFERENCES contracting_parties(id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'contracting_parties' AS table_name, COUNT(*) AS row_count FROM contracting_parties
UNION ALL
SELECT 'student_contracting_parties', COUNT(*) FROM student_contracting_parties;
