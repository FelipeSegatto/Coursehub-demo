-- CourseHub
-- Rollback for: 20260918_002_audit_user_foreign_keys.sql
-- Date: 2026-09-18
-- MySQL: 8.0+
--
-- Remove as FKs ON DELETE SET NULL das colunas de auditoria.
-- Os valores de user_id nas linhas existentes nao sao alterados.

USE coursehub_escola;

ALTER TABLE invoices
  DROP FOREIGN KEY fk_invoice_discount_applied_by;

ALTER TABLE payments
  DROP FOREIGN KEY fk_payment_recorded_by,
  DROP FOREIGN KEY fk_payment_refunded_by;

ALTER TABLE financial_events
  DROP FOREIGN KEY fk_financial_event_actor;