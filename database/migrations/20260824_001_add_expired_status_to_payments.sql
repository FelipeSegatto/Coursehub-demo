-- CourseHub
-- Migration: add 'expired' to payments.status
-- Date: 2026-08-24
-- Feature: payments lifecycle normalization -- PIX/boleto attempt expiration
-- MySQL: 8.0+
--
-- Purpose:
--   payments.status currently has no way to represent a PIX or boleto
--   attempt whose own deadline (pix_expires_at / boleto_due_date) has
--   passed without being paid. Today that case is left stuck as
--   'pending' forever, which both misrepresents the attempt and made
--   isReusableAttempt() the only place distinguishing "still payable"
--   from "dead" pending rows. 'expired' names that state explicitly.
--
-- Domain rules (see paymentStateMachine.js):
--   - Only reachable from 'pending' (pending -> expired).
--   - Never reachable from 'approved', 'rejected', 'cancelled',
--     'refunded' or 'chargeback' -- all of those are already terminal
--     in the existing state machine and stay that way.
--   - Applies only to payment_method IN ('pix', 'boleto'). credit_card
--     attempts are never auto-expired by time (see
--     invoicePaymentService.js#expireDuePaymentAttempts).
--   - This is a payments-level (attempt-level) status only. It never
--     changes invoices.status -- an invoice stays open/pending even
--     after one of its payment attempts expires, so the student can
--     simply try again.
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   Requires a DB user with DDL privileges (ALTER).
--   MySQL DDL statements perform implicit commits, so run this only
--   after a backup. Adding an ENUM value via MODIFY COLUMN is a
--   metadata-only change in MySQL 8 (no table rebuild, near-instant).

USE coursehub_escola;

ALTER TABLE payments
  MODIFY COLUMN status
    ENUM('created', 'pending', 'approved', 'rejected', 'cancelled', 'refunded', 'chargeback', 'expired')
    NOT NULL DEFAULT 'created';

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'payments' AS table_name, COUNT(*) AS row_count FROM payments;
SELECT status, COUNT(*) AS payments_by_status FROM payments GROUP BY status;
