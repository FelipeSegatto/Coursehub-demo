-- Rollback for: 20260802_001_drop_activity_submissions_and_staff_role
-- Structural rollback only — recreates the dropped tables and the wider enum.
-- No data is restored (both tables had zero rows at the time of the migration).

ALTER TABLE users
  MODIFY COLUMN role ENUM('admin', 'manager', 'teacher', 'student', 'staff') NOT NULL DEFAULT 'student';

CREATE TABLE IF NOT EXISTS staff (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL,
  registration_number VARCHAR(50) NOT NULL,
  department VARCHAR(100) NULL,
  position_name VARCHAR(100) NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY user_id (user_id),
  UNIQUE KEY email (email),
  UNIQUE KEY registration_number (registration_number),
  CONSTRAINT fk_staff_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_submissions (
  id INT NOT NULL AUTO_INCREMENT,
  activity_id INT NOT NULL,
  student_id INT NOT NULL,
  status ENUM('draft', 'submitted', 'pending_review', 'graded', 'returned') NOT NULL DEFAULT 'submitted',
  score DECIMAL(5, 2) NULL,
  feedback TEXT NULL,
  answers_json JSON NULL,
  submitted_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  graded_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_activity_submission (activity_id, student_id),
  CONSTRAINT fk_activity_submissions_activity FOREIGN KEY (activity_id) REFERENCES activities (id) ON DELETE CASCADE,
  CONSTRAINT fk_activity_submissions_student FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
