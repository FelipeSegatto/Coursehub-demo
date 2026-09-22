-- P11: students.email é cópia de leitura de users.email (auth).
-- Idempotente. No live de 2026-09-18 havia 1 linha (student 59).

UPDATE students s
INNER JOIN users u ON u.id = s.user_id
SET s.email = u.email, s.updated_at = NOW()
WHERE s.email <> u.email;
