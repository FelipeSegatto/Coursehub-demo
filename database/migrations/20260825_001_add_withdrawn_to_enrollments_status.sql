-- CourseHub
-- Migration: add 'withdrawn' to enrollments.status
-- Date: 2026-08-25
-- Feature: admin-registered student withdrawal (desistência)
-- MySQL: 8.0+
--
-- Purpose:
--   contractWithdrawalService.js (registerContractWithdrawal) already
--   encerra contrato + matrícula numa única transação quando o admin
--   confirma que um aluno desistiu, mas até esta migration ele
--   reaproveitava enrollments.status = 'cancelled' -- o mesmo valor já
--   usado pelo endpoint administrativo genérico
--   (adminEnrollmentService.js#updateEnrollmentStatus) para qualquer
--   outro motivo de cancelamento manual de matrícula. 'withdrawn' dá
--   um valor estrutural específico só para "o aluno desistiu",
--   distinguível de um cancelamento administrativo por outro motivo,
--   sem reaproveitar um valor genérico já usado por outro fluxo.
--
-- Domain rules:
--   - Só alcançável a partir de matrícula 'active' (mesma regra de
--     WITHDRAWABLE_CONTRACT_STATUSES em contractWithdrawalService.js
--     -- nunca a partir de 'completed').
--   - O gate de acesso acadêmico
--     (classAccessService.js#getActiveEnrollmentForStudent) já exige
--     status = 'active', então 'withdrawn' já perde acesso
--     automaticamente, sem nenhuma mudança adicional de query.
--   - Não substitui 'cancelled' -- ambos continuam existindo,
--     'cancelled' para os demais motivos administrativos.
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   Requires a DB user with DDL privileges (ALTER).
--   MySQL DDL statements perform implicit commits, so run this only
--   after a backup. Adding an ENUM value via MODIFY COLUMN is a
--   metadata-only change in MySQL 8 (no table rebuild, near-instant).

USE coursehub_escola;

ALTER TABLE enrollments
  MODIFY COLUMN status
    ENUM('active', 'inactive', 'completed', 'cancelled', 'locked', 'withdrawn')
    NOT NULL;

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'enrollments' AS table_name, COUNT(*) AS row_count FROM enrollments;
SELECT status, COUNT(*) AS enrollments_by_status FROM enrollments GROUP BY status;
