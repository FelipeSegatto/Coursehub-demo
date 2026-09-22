-- CourseHub
-- Migration: FK SET NULL on financial/academic audit user columns
-- Date: 2026-09-18
-- MySQL: 8.0+
--
-- These columns were left without FKs so a deleted user would not
-- wipe audit history. The application never hard-deletes users; SET
-- NULL keeps the event row if that ever happens.

USE coursehub_escola;

ALTER TABLE invoices
  ADD CONSTRAINT fk_invoice_discount_applied_by
    FOREIGN KEY (discount_applied_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE payments
  ADD CONSTRAINT fk_payment_recorded_by
    FOREIGN KEY (recorded_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT fk_payment_refunded_by
    FOREIGN KEY (refunded_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE financial_events
  ADD CONSTRAINT fk_financial_event_actor
    FOREIGN KEY (actor_user_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE;
