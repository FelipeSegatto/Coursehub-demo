-- CourseHub
-- Seed: complementary commercial pricing plans for every active course
-- Date: 2026-08-13
-- MySQL: 8.0+
--
-- Purpose:
--   Before this seed, course_pricing_plans only covered courses 1-8,
--   and every one of those 8 rows had exactly ONE billing type
--   (course 1 only had "one_time"; courses 2-8 only had
--   "monthly_plan"). Courses 9 and 10 had no plan at all. This seed
--   adds only the MISSING complementary type per course, so every
--   active course ends up with both a "one_time" and a "monthly_plan"
--   option, without touching any plan that already exists.
--
-- Idempotency:
--   Every INSERT is guarded by "WHERE NOT EXISTS (... course_id AND
--   name ...)" -- running this file again is a no-op, it will not
--   duplicate any row. This also means it does not depend on the
--   uq_pricing_plan_course_name constraint from
--   20260813_001_add_pricing_plan_unique_name.sql to be safe to
--   re-run, though that migration should still be applied for the
--   admin CRUD's own duplicate protection.
--
-- Safety:
--   - Never touches existing course_pricing_plans rows (no UPDATE, no
--     DELETE) -- the 8 pre-existing plans, and the 13
--     financial_contracts that already reference them via
--     pricing_plan_id, are completely untouched.
--   - Prices were NOT derived from courses.price (that column is
--     acknowledged as possibly stale) -- each new plan's total was
--     chosen to be coherent with the course's workload_hours/nivel,
--     compared against similar existing plans for other courses at a
--     similar level/duration.
--   - Every new "monthly_plan" row satisfies
--     total_amount = monthly_payment_count * monthly_payment_amount
--     exactly, matching the rule the CRUD backend also enforces.
--   - Every new "one_time" total sits at a moderate discount (roughly
--     10-15%) below the course's existing/new monthly total, never
--     the other way around.
--
-- This is a seed, not a schema migration -- it belongs in
-- database/seeds/, not database/migrations/, and is safe to run
-- against an environment that has already run the migrations.

USE coursehub_escola;

-- -----------------------------------------------------------------------------
-- Course 1 -- React do Zero (Iniciante, 60h) -- already has "one_time"
-- (Plano Integral, R$1490,00). Adds the missing "monthly_plan".
-- -----------------------------------------------------------------------------
INSERT INTO course_pricing_plans
  (course_id, name, description, billing_type, total_amount, monthly_payment_count,
   monthly_payment_amount, max_card_installments, accepts_pix, accepts_boleto,
   accepts_credit_card, status, created_at, updated_at)
SELECT 1, 'Plano mensal', 'Plano com seis mensalidades e acesso completo ao curso.',
       'monthly_plan', 1680.00, 6, 280.00, 1, 1, 1, 1, 'active', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM course_pricing_plans WHERE course_id = 1 AND name = 'Plano mensal'
);

-- -----------------------------------------------------------------------------
-- Course 2 -- JavaScript Essencial (Intermediário, 80h) -- already has
-- "monthly_plan" (Plano Mensal Padrão, 6x R$280,00 = R$1680,00). Adds
-- the missing "one_time" at a moderate discount.
-- -----------------------------------------------------------------------------
INSERT INTO course_pricing_plans
  (course_id, name, description, billing_type, total_amount, monthly_payment_count,
   monthly_payment_amount, max_card_installments, accepts_pix, accepts_boleto,
   accepts_credit_card, status, created_at, updated_at)
SELECT 2, 'Pagamento à vista', 'Pagamento único com acesso completo ao curso.',
       'one_time', 1490.00, NULL, NULL, 10, 1, 1, 1, 'active', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM course_pricing_plans WHERE course_id = 2 AND name = 'Pagamento à vista'
);

-- -----------------------------------------------------------------------------
-- Course 3 -- Fundamentos de UX/UI (Intermediário, 70h) -- already has
-- "monthly_plan" (Plano Formação em Dados, 7x R$310,00 = R$2170,00).
-- -----------------------------------------------------------------------------
INSERT INTO course_pricing_plans
  (course_id, name, description, billing_type, total_amount, monthly_payment_count,
   monthly_payment_amount, max_card_installments, accepts_pix, accepts_boleto,
   accepts_credit_card, status, created_at, updated_at)
SELECT 3, 'Pagamento à vista', 'Pagamento único com acesso completo ao curso.',
       'one_time', 1890.00, NULL, NULL, 10, 1, 1, 1, 'active', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM course_pricing_plans WHERE course_id = 3 AND name = 'Pagamento à vista'
);

-- -----------------------------------------------------------------------------
-- Course 4 -- Tailwind CSS e Responsive Design (Iniciante, 50h) --
-- already has "monthly_plan" (Plano Mensal Flex, 8x R$245,00 = R$1960,00).
-- -----------------------------------------------------------------------------
INSERT INTO course_pricing_plans
  (course_id, name, description, billing_type, total_amount, monthly_payment_count,
   monthly_payment_amount, max_card_installments, accepts_pix, accepts_boleto,
   accepts_credit_card, status, created_at, updated_at)
SELECT 4, 'Pagamento à vista', 'Pagamento único com acesso completo ao curso.',
       'one_time', 1690.00, NULL, NULL, 10, 1, 1, 1, 'active', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM course_pricing_plans WHERE course_id = 4 AND name = 'Pagamento à vista'
);

-- -----------------------------------------------------------------------------
-- Course 5 -- Introdução ao Node.js e Express (Iniciante, 45h) --
-- already has "monthly_plan" (Plano Intensivo, 4x R$375,00 = R$1500,00).
-- -----------------------------------------------------------------------------
INSERT INTO course_pricing_plans
  (course_id, name, description, billing_type, total_amount, monthly_payment_count,
   monthly_payment_amount, max_card_installments, accepts_pix, accepts_boleto,
   accepts_credit_card, status, created_at, updated_at)
SELECT 5, 'Pagamento à vista', 'Pagamento único com acesso completo ao curso.',
       'one_time', 1290.00, NULL, NULL, 10, 1, 1, 1, 'active', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM course_pricing_plans WHERE course_id = 5 AND name = 'Pagamento à vista'
);

-- -----------------------------------------------------------------------------
-- Course 6 -- Desenvolvimento de Interfaces com Figma (Intermediário,
-- 40h) -- already has "monthly_plan" (Plano Desenvolvimento Completo,
-- 5x R$298,00 = R$1490,00).
-- -----------------------------------------------------------------------------
INSERT INTO course_pricing_plans
  (course_id, name, description, billing_type, total_amount, monthly_payment_count,
   monthly_payment_amount, max_card_installments, accepts_pix, accepts_boleto,
   accepts_credit_card, status, created_at, updated_at)
SELECT 6, 'Pagamento à vista', 'Pagamento único com acesso completo ao curso.',
       'one_time', 1290.00, NULL, NULL, 10, 1, 1, 1, 'active', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM course_pricing_plans WHERE course_id = 6 AND name = 'Pagamento à vista'
);

-- -----------------------------------------------------------------------------
-- Course 7 -- Git e GitHub (Intermediário, 55h) -- already has
-- "monthly_plan" (Plano Mensal Essencial, 6x R$320,00 = R$1920,00).
-- -----------------------------------------------------------------------------
INSERT INTO course_pricing_plans
  (course_id, name, description, billing_type, total_amount, monthly_payment_count,
   monthly_payment_amount, max_card_installments, accepts_pix, accepts_boleto,
   accepts_credit_card, status, created_at, updated_at)
SELECT 7, 'Pagamento à vista', 'Pagamento único com acesso completo ao curso.',
       'one_time', 1650.00, NULL, NULL, 10, 1, 1, 1, 'active', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM course_pricing_plans WHERE course_id = 7 AND name = 'Pagamento à vista'
);

-- -----------------------------------------------------------------------------
-- Course 8 -- Introdução ao Framer Motion (Iniciante, 25h) -- already
-- has "monthly_plan" (Plano Profissional, 4x R$275,00 = R$1100,00).
-- -----------------------------------------------------------------------------
INSERT INTO course_pricing_plans
  (course_id, name, description, billing_type, total_amount, monthly_payment_count,
   monthly_payment_amount, max_card_installments, accepts_pix, accepts_boleto,
   accepts_credit_card, status, created_at, updated_at)
SELECT 8, 'Pagamento à vista', 'Pagamento único com acesso completo ao curso.',
       'one_time', 950.00, NULL, NULL, 10, 1, 1, 1, 'active', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM course_pricing_plans WHERE course_id = 8 AND name = 'Pagamento à vista'
);

-- -----------------------------------------------------------------------------
-- Course 9 -- Adobe Photoshop Intermediário (Intermediário, 60h) -- had
-- NO pricing plan at all. Adds both types.
-- -----------------------------------------------------------------------------
INSERT INTO course_pricing_plans
  (course_id, name, description, billing_type, total_amount, monthly_payment_count,
   monthly_payment_amount, max_card_installments, accepts_pix, accepts_boleto,
   accepts_credit_card, status, created_at, updated_at)
SELECT 9, 'Pagamento à vista', 'Pagamento único com acesso completo ao curso.',
       'one_time', 1550.00, NULL, NULL, 10, 1, 1, 1, 'active', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM course_pricing_plans WHERE course_id = 9 AND name = 'Pagamento à vista'
);

INSERT INTO course_pricing_plans
  (course_id, name, description, billing_type, total_amount, monthly_payment_count,
   monthly_payment_amount, max_card_installments, accepts_pix, accepts_boleto,
   accepts_credit_card, status, created_at, updated_at)
SELECT 9, 'Plano mensal', 'Plano com seis mensalidades e acesso completo ao curso.',
       'monthly_plan', 1800.00, 6, 300.00, 1, 1, 1, 1, 'active', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM course_pricing_plans WHERE course_id = 9 AND name = 'Plano mensal'
);

-- -----------------------------------------------------------------------------
-- Course 10 -- Adobe Illustrator (Iniciante, 40h) -- had NO pricing
-- plan at all. Adds both types.
-- -----------------------------------------------------------------------------
INSERT INTO course_pricing_plans
  (course_id, name, description, billing_type, total_amount, monthly_payment_count,
   monthly_payment_amount, max_card_installments, accepts_pix, accepts_boleto,
   accepts_credit_card, status, created_at, updated_at)
SELECT 10, 'Pagamento à vista', 'Pagamento único com acesso completo ao curso.',
       'one_time', 1050.00, NULL, NULL, 10, 1, 1, 1, 'active', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM course_pricing_plans WHERE course_id = 10 AND name = 'Pagamento à vista'
);

INSERT INTO course_pricing_plans
  (course_id, name, description, billing_type, total_amount, monthly_payment_count,
   monthly_payment_amount, max_card_installments, accepts_pix, accepts_boleto,
   accepts_credit_card, status, created_at, updated_at)
SELECT 10, 'Plano mensal', 'Plano com quatro mensalidades e acesso completo ao curso.',
       'monthly_plan', 1200.00, 4, 300.00, 1, 1, 1, 1, 'active', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM course_pricing_plans WHERE course_id = 10 AND name = 'Plano mensal'
);

-- -----------------------------------------------------------------------------
-- POST-SEED VERIFICATION
-- -----------------------------------------------------------------------------

SELECT course_id, COUNT(*) AS plan_count
FROM course_pricing_plans
WHERE status = 'active'
GROUP BY course_id
ORDER BY course_id;
