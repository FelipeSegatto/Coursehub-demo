-- CourseHub
-- Rollback for: 20260918_001_enrollment_alive_unique_and_pricing_plan_name.sql
-- Date: 2026-09-18
-- MySQL: 8.0+
--
-- Restaura uk_enrollment_student_course (um aluno + um curso = uma linha)
-- e remove alive_marker.
--
-- NAO desfaz o UPDATE de repair (matriculas active ligadas a contrato
-- cancelled). Esse dado ja foi corrigido de proposito.
--
-- NAO remove uq_pricing_plan_course_name: essa unique pode ter vindo
-- da migration 20260813_001. O rollback dela e
-- 20260813_001_remove_pricing_plan_unique_name.sql.
--
-- Se ja existirem duas matriculas vivas (ou historicas) para o mesmo
-- aluno+curso, o ADD UNIQUE abaixo falha. Nesse caso e preciso
-- resolver as duplicatas antes de rodar este rollback.

USE coursehub_escola;

ALTER TABLE enrollments
  DROP INDEX uk_enrollment_student_course_alive,
  DROP COLUMN alive_marker,
  ADD UNIQUE KEY uk_enrollment_student_course (student_id, course_id);