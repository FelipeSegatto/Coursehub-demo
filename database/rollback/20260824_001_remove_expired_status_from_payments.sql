-- =========================================================
-- Rollback: remove 'expired' from payments.status
-- Related migration:
-- 20260824_001_add_expired_status_to_payments.sql
-- =========================================================
--
-- Warning:
-- Will FAIL if any row currently has status = 'expired' (MySQL
-- rejects an ENUM MODIFY that would leave existing rows without a
-- matching value), since this rollback restores the original
-- 7-value enum. Check first:
--   SELECT COUNT(*) FROM payments WHERE status = 'expired';
-- Those rows have no safe automatic remap ('cancelled' is the closest
-- existing semantic but is not equivalent -- it would misrepresent
-- attempts that simply timed out as if they had been actively
-- cancelled) -- reassign manually first or skip this rollback
-- entirely.
-- =========================================================

USE coursehub_escola;

ALTER TABLE payments
  MODIFY COLUMN status
    ENUM('created', 'pending', 'approved', 'rejected', 'cancelled', 'refunded', 'chargeback')
    NOT NULL DEFAULT 'created';
