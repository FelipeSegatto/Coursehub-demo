-- CourseHub
-- Schema snapshot after migration:
--   2026-07-29-admin-financial-operations.sql
--
-- Instructions:
--   1. Run each SHOW CREATE TABLE command below in MySQL Workbench.
--   2. In the result grid, copy the complete value from the "Create Table" column.
--   3. Paste each CREATE TABLE statement under its matching section.
--   4. Keep this file as documentation. Do not execute it as a migration.
--
-- Recommended Workbench workflow:
--   - execute one SHOW CREATE TABLE at a time;
--   - click the Create Table result cell;
--   - copy the complete value;
--   - paste it below the corresponding heading;
--   - add a semicolon after the CREATE TABLE statement if needed.

USE coursehub_escola;

SHOW CREATE TABLE course_pricing_plans;
SHOW CREATE TABLE financial_contracts;
SHOW CREATE TABLE invoices;
SHOW CREATE TABLE payments;
SHOW CREATE TABLE payment_events;
SHOW CREATE TABLE financial_events;
SHOW CREATE TABLE invoice_collection_actions;
SHOW CREATE TABLE enrollments;
SHOW CREATE TABLE users;

-- Commands used to generate this snapshot:
CREATE TABLE `course_pricing_plans` (
  `id` int NOT NULL AUTO_INCREMENT,
  `course_id` int NOT NULL,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `billing_type` enum('one_time','monthly_plan') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `total_amount` decimal(10,2) NOT NULL,
  `monthly_payment_count` int DEFAULT NULL,
  `monthly_payment_amount` decimal(10,2) DEFAULT NULL,
  `max_card_installments` int NOT NULL DEFAULT '1',
  `accepts_pix` tinyint(1) NOT NULL DEFAULT '1',
  `accepts_boleto` tinyint(1) NOT NULL DEFAULT '1',
  `accepts_credit_card` tinyint(1) NOT NULL DEFAULT '1',
  `status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pricing_plan_course` (`course_id`),
  KEY `idx_pricing_plan_status` (`status`),
  CONSTRAINT `fk_pricing_plan_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

CREATE TABLE `financial_contracts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `enrollment_id` int NOT NULL,
  `pricing_plan_id` int NOT NULL,
  `billing_type` enum('one_time','monthly_plan') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `plan_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `total_amount` decimal(10,2) NOT NULL,
  `monthly_payment_count` int DEFAULT NULL,
  `monthly_payment_amount` decimal(10,2) DEFAULT NULL,
  `max_card_installments` int NOT NULL DEFAULT '1',
  `accepts_pix` tinyint(1) NOT NULL DEFAULT '1',
  `accepts_boleto` tinyint(1) NOT NULL DEFAULT '1',
  `accepts_credit_card` tinyint(1) NOT NULL DEFAULT '1',
  `status` enum('pending','active','overdue','completed','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `start_date` date NOT NULL,
  `completed_at` datetime DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_financial_contract_enrollment` (`enrollment_id`),
  KEY `fk_financial_contract_plan` (`pricing_plan_id`),
  KEY `idx_financial_contract_status` (`status`),
  CONSTRAINT `fk_financial_contract_enrollment` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments` (`id`),
  CONSTRAINT `fk_financial_contract_plan` FOREIGN KEY (`pricing_plan_id`) REFERENCES `course_pricing_plans` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

CREATE TABLE `invoices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `financial_contract_id` int NOT NULL,
  `invoice_type` enum('full_payment','monthly_payment') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `installment_number` int DEFAULT NULL,
  `installment_count` int DEFAULT NULL,
  `description` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `original_amount` decimal(10,2) DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `discount_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `discount_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `discount_applied_at` datetime DEFAULT NULL,
  `discount_applied_by_user_id` int DEFAULT NULL,
  `due_date` date NOT NULL,
  `status` enum('pending','processing','paid','overdue','cancelled','refunded') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `paid_at` datetime DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_contract_installment` (`financial_contract_id`,`installment_number`),
  KEY `idx_invoice_contract` (`financial_contract_id`),
  KEY `idx_invoice_status` (`status`),
  KEY `idx_invoice_due_date` (`due_date`),
  CONSTRAINT `fk_invoice_contract` FOREIGN KEY (`financial_contract_id`) REFERENCES `financial_contracts` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=78 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

CREATE TABLE `payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `invoice_id` int NOT NULL,
  `gateway` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'simulated',
  `gateway_payment_id` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `source` enum('gateway','admin_manual','system') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'gateway',
  `recorded_by_user_id` int DEFAULT NULL,
  `admin_note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_method` enum('pix','boleto','credit_card','bank_transfer','cash','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `status` enum('created','pending','approved','rejected','cancelled','refunded','chargeback') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'created',
  `card_installments` int DEFAULT NULL,
  `card_brand` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `card_last_four` char(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pix_copy_paste` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `pix_qr_code` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `pix_expires_at` datetime DEFAULT NULL,
  `boleto_barcode` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `boleto_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `boleto_due_date` date DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `rejected_at` datetime DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `refunded_at` datetime DEFAULT NULL,
  `refund_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `refunded_by_user_id` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gateway_payment` (`gateway`,`gateway_payment_id`),
  KEY `idx_payment_invoice` (`invoice_id`),
  KEY `idx_payment_status` (`status`),
  KEY `idx_payment_method` (`payment_method`),
  CONSTRAINT `fk_payment_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=37 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci


CREATE TABLE `payment_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `payment_id` int NOT NULL,
  `event_type` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `previous_status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_status` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `source` enum('simulated_gateway','gateway_webhook','admin','system') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `gateway_event_id` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payload` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_gateway_event` (`gateway_event_id`),
  KEY `idx_payment_event_payment` (`payment_id`),
  CONSTRAINT `fk_payment_event_payment` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=130 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

CREATE TABLE `financial_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `financial_contract_id` int NOT NULL,
  `invoice_id` int DEFAULT NULL,
  `payment_id` int DEFAULT NULL,
  `enrollment_id` int DEFAULT NULL,
  `event_type` varchar(100) NOT NULL,
  `source` enum('system','admin','gateway','student') NOT NULL,
  `actor_user_id` int DEFAULT NULL,
  `previous_value` json DEFAULT NULL,
  `new_value` json DEFAULT NULL,
  `reason` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_financial_event_contract` (`financial_contract_id`),
  KEY `idx_financial_event_invoice` (`invoice_id`),
  KEY `idx_financial_event_payment` (`payment_id`),
  KEY `idx_financial_event_enrollment` (`enrollment_id`),
  KEY `idx_financial_event_type` (`event_type`),
  CONSTRAINT `fk_financial_event_contract` FOREIGN KEY (`financial_contract_id`) REFERENCES `financial_contracts` (`id`),
  CONSTRAINT `fk_financial_event_enrollment` FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments` (`id`),
  CONSTRAINT `fk_financial_event_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`),
  CONSTRAINT `fk_financial_event_payment` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci

CREATE TABLE `invoice_collection_actions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `invoice_id` int NOT NULL,
  `action_type` enum('reminder_3_days_before','due_date_notice','marked_overdue','overdue_charge_10_days','lock_warning_15_days','enrollment_locked_30_days') NOT NULL,
  `status` enum('pending','processed','failed','skipped') NOT NULL DEFAULT 'pending',
  `scheduled_for` date NOT NULL,
  `processed_at` datetime DEFAULT NULL,
  `error_message` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_invoice_collection_action` (`invoice_id`,`action_type`),
  CONSTRAINT `fk_collection_action_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci


CREATE TABLE `enrollments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `student_id` int NOT NULL,
  `course_id` int NOT NULL,
  `class_id` int DEFAULT NULL,
  `status` enum('active','inactive','completed','cancelled','locked') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `enrolled_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` datetime DEFAULT NULL,
  `locked_at` datetime DEFAULT NULL,
  `lock_reason` enum('financial_overdue','administrative','academic','other') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `locked_by_user_id` int DEFAULT NULL,
  `lock_note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reactivated_at` datetime DEFAULT NULL,
  `reactivated_by_user_id` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_enrollment_student_course` (`student_id`,`course_id`),
  KEY `fk_enrollments_course` (`course_id`),
  KEY `fk_enrollments_class` (`class_id`),
  CONSTRAINT `fk_enrollments_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_enrollments_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_enrollments_student` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=163 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `gender` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `avatar_key` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` enum('admin','manager','teacher','student','staff') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'student',
  `status` enum('active','inactive','blocked') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=86 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci

