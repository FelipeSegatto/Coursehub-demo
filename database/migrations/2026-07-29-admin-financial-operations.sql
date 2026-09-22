-- CourseHub
-- Migration: Admin financial operations and automated collection workflow
-- Date: 2026-07-29
-- MySQL: 8.0+
--
-- Purpose:
--   - support manual payment registration;
--   - support invoice due-date changes;
--   - support invoice discounts;
--   - support full payment refunds;
--   - record auditable financial events;
--   - record idempotent automated collection actions;
--   - identify financial enrollment locks and reactivations.
--
-- Compatibility:
--   Existing columns used by the student financial area are preserved.
--   invoices.amount remains the final amount payable.
--   invoices.due_date remains the current due date.
--   Existing invoice/payment/enrollment status values are preserved.
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   MySQL DDL statements perform implicit commits, so run this only after a backup.

USE coursehub_escola;

-- -----------------------------------------------------------------------------
-- 1. INVOICES
-- -----------------------------------------------------------------------------
-- original_amount stores the amount before any administrative discount.
-- amount continues to store the final amount payable by the student.

ALTER TABLE invoices
  ADD COLUMN original_amount DECIMAL(10,2) NULL AFTER description,
  ADD COLUMN discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER amount,
  ADD COLUMN discount_reason VARCHAR(255) NULL AFTER discount_amount,
  ADD COLUMN discount_applied_at DATETIME NULL AFTER discount_reason,
  ADD COLUMN discount_applied_by_user_id INT NULL AFTER discount_applied_at,
  ADD KEY idx_invoice_discount_applied_by (discount_applied_by_user_id);

-- Preserve the current invoice amount as its original amount.
UPDATE invoices
SET original_amount = amount
WHERE original_amount IS NULL;

-- Once existing rows are populated, make the column mandatory.
ALTER TABLE invoices
  MODIFY COLUMN original_amount DECIMAL(10,2) NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. PAYMENTS
-- -----------------------------------------------------------------------------
-- Extend payment methods without removing existing values.
-- source distinguishes gateway payments from manually recorded payments.

ALTER TABLE payments
  MODIFY COLUMN payment_method ENUM(
    'pix',
    'boleto',
    'credit_card',
    'bank_transfer',
    'cash',
    'other'
  ) COLLATE utf8mb4_unicode_ci NOT NULL,
  ADD COLUMN source ENUM(
    'gateway',
    'admin_manual',
    'system'
  ) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'gateway' AFTER gateway_payment_id,
  ADD COLUMN recorded_by_user_id INT NULL AFTER source,
  ADD COLUMN admin_note VARCHAR(500) NULL AFTER recorded_by_user_id,
  ADD COLUMN refund_reason VARCHAR(255) NULL AFTER refunded_at,
  ADD COLUMN refunded_by_user_id INT NULL AFTER refund_reason,
  ADD KEY idx_payment_source (source),
  ADD KEY idx_payment_recorded_by (recorded_by_user_id),
  ADD KEY idx_payment_refunded_by (refunded_by_user_id);

-- -----------------------------------------------------------------------------
-- 3. ENROLLMENTS
-- -----------------------------------------------------------------------------
-- The existing status ENUM already includes 'locked'.
-- These columns identify why and how the lock/reactivation occurred.

ALTER TABLE enrollments
  ADD COLUMN locked_at DATETIME NULL AFTER completed_at,
  ADD COLUMN lock_reason ENUM(
    'financial_overdue',
    'administrative',
    'academic',
    'other'
  ) COLLATE utf8mb4_unicode_ci NULL AFTER locked_at,
  ADD COLUMN locked_by_user_id INT NULL AFTER lock_reason,
  ADD COLUMN lock_note VARCHAR(500) NULL AFTER locked_by_user_id,
  ADD COLUMN reactivated_at DATETIME NULL AFTER lock_note,
  ADD COLUMN reactivated_by_user_id INT NULL AFTER reactivated_at,
  ADD KEY idx_enrollment_lock_reason (lock_reason),
  ADD KEY idx_enrollment_locked_by (locked_by_user_id),
  ADD KEY idx_enrollment_reactivated_by (reactivated_by_user_id);

-- -----------------------------------------------------------------------------
-- 4. FINANCIAL EVENTS
-- -----------------------------------------------------------------------------
-- Functional and administrative audit history.
-- payment_events remains available for payment/gateway-specific events.

CREATE TABLE financial_events (
  id INT NOT NULL AUTO_INCREMENT,
  financial_contract_id INT NOT NULL,
  invoice_id INT NULL,
  payment_id INT NULL,
  enrollment_id INT NULL,

  event_type VARCHAR(100) NOT NULL,
  source ENUM(
    'system',
    'admin',
    'gateway',
    'student'
  ) NOT NULL,

  actor_user_id INT NULL,
  previous_value JSON NULL,
  new_value JSON NULL,
  reason VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  KEY idx_financial_event_contract (financial_contract_id),
  KEY idx_financial_event_invoice (invoice_id),
  KEY idx_financial_event_payment (payment_id),
  KEY idx_financial_event_enrollment (enrollment_id),
  KEY idx_financial_event_actor (actor_user_id),
  KEY idx_financial_event_type (event_type),
  KEY idx_financial_event_created_at (created_at),

  CONSTRAINT fk_financial_event_contract
    FOREIGN KEY (financial_contract_id)
    REFERENCES financial_contracts(id),

  CONSTRAINT fk_financial_event_invoice
    FOREIGN KEY (invoice_id)
    REFERENCES invoices(id),

  CONSTRAINT fk_financial_event_payment
    FOREIGN KEY (payment_id)
    REFERENCES payments(id),

  CONSTRAINT fk_financial_event_enrollment
    FOREIGN KEY (enrollment_id)
    REFERENCES enrollments(id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 5. AUTOMATED COLLECTION ACTIONS
-- -----------------------------------------------------------------------------
-- The unique key prevents the same collection action from being processed more
-- than once for the same invoice.

CREATE TABLE invoice_collection_actions (
  id INT NOT NULL AUTO_INCREMENT,
  invoice_id INT NOT NULL,

  action_type ENUM(
    'reminder_3_days_before',
    'due_date_notice',
    'marked_overdue',
    'overdue_charge_10_days',
    'lock_warning_15_days',
    'enrollment_locked_30_days'
  ) NOT NULL,

  status ENUM(
    'pending',
    'processed',
    'failed',
    'skipped'
  ) NOT NULL DEFAULT 'pending',

  scheduled_for DATE NOT NULL,
  processed_at DATETIME NULL,
  error_message VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_invoice_collection_action (invoice_id, action_type),
  KEY idx_collection_action_status_schedule (status, scheduled_for),
  KEY idx_collection_action_processed_at (processed_at),

  CONSTRAINT fk_collection_action_invoice
    FOREIGN KEY (invoice_id)
    REFERENCES invoices(id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 6. USER FOREIGN KEYS — ADD AFTER CONFIRMING THE USERS TABLE
-- -----------------------------------------------------------------------------
-- The *_by_user_id and actor_user_id columns intentionally remain without user
-- foreign keys in this migration because the exact users table definition must
-- be confirmed first (table name, PK type and deletion policy).
--
-- After checking SHOW CREATE TABLE users, add a separate migration using a
-- pattern such as:
--
-- ALTER TABLE invoices
--   ADD CONSTRAINT fk_invoice_discount_user
--     FOREIGN KEY (discount_applied_by_user_id)
--     REFERENCES users(id)
--     ON DELETE SET NULL;
--
-- Repeat for:
--   payments.recorded_by_user_id
--   payments.refunded_by_user_id
--   enrollments.locked_by_user_id
--   enrollments.reactivated_by_user_id
--   financial_events.actor_user_id

-- -----------------------------------------------------------------------------
-- 7. POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'invoices' AS table_name, COUNT(*) AS row_count FROM invoices
UNION ALL
SELECT 'payments', COUNT(*) FROM payments
UNION ALL
SELECT 'enrollments', COUNT(*) FROM enrollments
UNION ALL
SELECT 'financial_events', COUNT(*) FROM financial_events
UNION ALL
SELECT 'invoice_collection_actions', COUNT(*) FROM invoice_collection_actions;
