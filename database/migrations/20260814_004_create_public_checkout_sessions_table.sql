-- CourseHub
-- Migration: create public_checkout_sessions
-- Date: 2026-08-14
-- Feature: multi-channel checkout -- public course checkout
-- MySQL: 8.0+
--
-- Purpose:
--   Prevents an anonymous request from immediately creating a user,
--   financial_contract and invoice with no protection against spam or
--   mass fake-contract creation. A public checkout session is opened
--   (course + pricing plan + a contracting-party email) BEFORE any
--   user/contract/invoice exists, and must have its email verified
--   (email_verification_token_hash / email_verified_at) before the
--   heavy step-5 submission (which actually creates the student,
--   contracting party, contract and invoice) is allowed to run.
--
-- Domain rules:
--   - This is deliberately NOT the same concept as
--     account_activation_tokens: that table proves a real CourseHub
--     account holder controls their email; this one only proves a
--     checkout initiator controls the email they typed, before any
--     account exists. They must not be conflated or reused for each
--     other.
--   - status flow: pending_verification -> verified -> converted, or
--     -> expired. A session that never gets verified/converted before
--     expires_at is simply abandoned data, subject to the project's
--     retention policy -- this is NOT a financial cancellation (no
--     financial_contracts row exists yet at that point).
--   - financial_contract_id is set (and status moved to 'converted')
--     only once, at the end of the step-5 submission, in the same
--     transaction that creates the contract -- this is what makes
--     re-submitting the same session idempotent (a second attempt on
--     an already-converted session is rejected before creating
--     anything twice).
--   - Neither the raw session_token nor the raw
--     email_verification_token is ever stored -- only their SHA-256
--     hashes, same discipline as every other token table in this
--     project (utils/tokens.js: generateOpaqueToken/hashToken).
--   - course_id/pricing_plan_id are captured here specifically so the
--     step-5 submission can always re-read the ORIGINAL selected
--     course/plan from this session row, never from the request body
--     -- course_pricing_plans stays the only price source, and a
--     tampered/stale client can never submit a different plan than
--     the one the session was opened for.
--
-- Important:
--   This is a one-time migration. Do not execute it twice.
--   Requires a DB user with DDL privileges (CREATE).

USE coursehub_escola;

CREATE TABLE public_checkout_sessions (
  id INT NOT NULL AUTO_INCREMENT,

  session_token_hash CHAR(64) NOT NULL,

  course_id INT NOT NULL,
  pricing_plan_id INT NOT NULL,
  contracting_party_email VARCHAR(255) NOT NULL,

  email_verification_token_hash CHAR(64) NOT NULL,
  email_verified_at DATETIME NULL,

  financial_contract_id INT NULL,

  status ENUM('pending_verification', 'verified', 'converted', 'expired')
    NOT NULL DEFAULT 'pending_verification',

  expires_at DATETIME NOT NULL,
  completed_at DATETIME NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),

  UNIQUE KEY uq_public_checkout_sessions_hash (session_token_hash),
  KEY idx_public_checkout_sessions_email_hash (email_verification_token_hash),
  KEY idx_public_checkout_sessions_email_status (contracting_party_email, status),
  KEY idx_public_checkout_sessions_contract (financial_contract_id),

  CONSTRAINT fk_public_checkout_sessions_course
    FOREIGN KEY (course_id)
    REFERENCES courses(id)
    ON DELETE RESTRICT,

  CONSTRAINT fk_public_checkout_sessions_plan
    FOREIGN KEY (pricing_plan_id)
    REFERENCES course_pricing_plans(id)
    ON DELETE RESTRICT,

  CONSTRAINT fk_public_checkout_sessions_contract
    FOREIGN KEY (financial_contract_id)
    REFERENCES financial_contracts(id)
    ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_0900_ai_ci;

-- -----------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION
-- -----------------------------------------------------------------------------

SELECT 'public_checkout_sessions' AS table_name, COUNT(*) AS row_count FROM public_checkout_sessions;
