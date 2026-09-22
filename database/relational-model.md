# CourseHub — Modelo Relacional

> Levantado via `information_schema` do banco `coursehub_escola` em 2026-09-18 (52 tabelas). Substitui o snapshot de 2026-08-02 (28 tabelas). O schema do database já era `utf8mb4_0900_ai_ci`; a migration `20260918_003` converte as 34 tabelas que ainda estavam em `utf8mb4_unicode_ci`.

## 1. Como ler este documento

Cada seção lista as tabelas do domínio, chaves e regras que o código realmente usa. Soft delete via `status` é o padrão; o app não faz DELETE físico de histórico acadêmico/financeiro.

## 2. Identidade e acesso

### `users`
Raiz de autenticação. JWT carrega `users.id`. `email` UNIQUE. `role` enum('admin','teacher','student'). `status` enum('active','inactive','blocked'). `password_hash` bcrypt.

### `students` / `teachers`
1:1 com `users` via `user_id` UNIQUE, ON DELETE CASCADE. Duplicam `name`/`email`/`gender` para leitura sem join. **Fonte de auth do e-mail é `users.email`** — `20260918_004` sincroniza divergências. FKs acadêmicas apontam para `students.id` / `teachers.id`, nunca para `registration_number`.

### Tokens
`refresh_tokens`, `password_reset_tokens`, `account_activation_tokens`: hash opaco, FK `user_id` → `users.id` ON DELETE CASCADE. Purga de refresh/reset expirados no boot da API.

## 3. Catálogo acadêmico

### `courses`
`teacher_id` FK → `teachers.id` ON DELETE SET NULL, **legado/nullable**. Membership oficial é N:N em `course_teachers` (`status` active/inactive, PK composta course_id+teacher_id). `price` decimal ainda existe; o checkout lê `course_pricing_plans`. `status` enum('active','inactive','draft','archived') — catálogo público só `active`.

### `course_pricing_plans`
FK `course_id`. Unique viva `(course_id, name)` (`uq_pricing_plan_course_name`). `billing_type` one_time/monthly_plan.

### `classes`
Um `teacher_id` responsável (ON DELETE RESTRICT). Co-professor do curso **opera** a turma (frequência/encontros/correção) sem herdar esse campo.

### `class_sessions`
FK `class_id` CASCADE. UNIQUE `(class_id, session_number)`. Soft `cancelled`/`archived`.

### `course_contents`
FK `course_id` CASCADE; `class_id` RESTRICT nullable (NULL = geral do curso). **`type` enum('video','pdf','text','live_class')** — `activity`/`assessment` saíram em `20260918_003` (atividades vivem em `activities`). Sem `content_url`/`content_text` na API pública.

## 4. Matrícula e progresso

### `enrollments`
UNIQUE viva `(student_id, course_id)` via `alive_marker` + `uk_enrollment_student_course_alive`: no máximo uma matrícula viva (`active`/`inactive`/`locked`/`completed`). `cancelled`/`withdrawn` são histórico e permitem rematrícula. `completed` não permite retake. `class_id` SET NULL.

### `student_content_progress`
UNIQUE `(student_id, content_id)`. Progresso só conta os quatro tipos de conteúdo.

### `attendance`
UNIQUE `(class_session_id, student_id)`. `status` present/absent/late/excused.

## 5. Atividades e avaliações

`activities.activity_kind` enum('activity','exam') — mesma tabela, UI separada. Escopo `class_id` NULL = curso inteiro. UNIQUE de envio `(student_id, activity_id)` em `submissions` e `grades`.

`activity_questions` / `activity_options` / `submissions` / `submission_answers` / `grades` — correção substitui o envio, não cria outro.

## 6. Financeiro

Contrato ≠ matrícula: `financial_contracts.enrollment_id` é nullable até a ativação. Invoice ≠ tentativa: `invoices` é a obrigação; `payments` é a tentativa (`expired` só em `payments.status`). `invoices.status` inclui `processing` no ENUM (leituras defensivas; o fluxo atual não grava esse valor).

### Tabelas
`contracting_parties`, `student_contracting_parties`, `financial_contracts`, `invoices`, `payments`, `payment_events`, `financial_events` (FKs de auditoria `discount_applied_by_user_id` / `recorded_by_user_id` / `refunded_by_user_id` / `actor_user_id` → `users.id` ON DELETE SET NULL), `invoice_collection_actions` (**processadas** pelo worker `scheduledRemindersWorker`; `ENABLE_ENROLLMENT_AUTO_LOCK` desligado por padrão), `invoice_payment_access_tokens`, `invoice_payment_sessions`, `public_checkout_sessions`, `contract_terms_documents`, `contract_acceptances`.

Cancelamento direto de contrato só em `pending_payment`. Ativo/atrasado usa desistência. PIX/boleto vencidos expiram na leitura.

## 7. Calendário, chat, notificações, documentos

### Calendário
`academic_calendar_events` (eventos institucionais). Encontros, prazos de atividade e `live_class` entram por agregação das tabelas de origem.

### Chat
`chat_conversations`, `chat_participants`, `chat_messages`, `chat_reports`, `chat_access_logs`. `admin_permissions` (chaves de supervisão; seed 20260918_001).

### Notificações
`notifications`, `notification_recipients`, `notification_deliveries`, `notification_preferences`. Outbox + worker de e-mail. Envio de atividade notifica todos os `course_teachers` ativos do curso.

### Documentos
`document_templates`, `generated_documents` (worker com lease). `certificates` e `declarations` existem no schema e têm fluxo de aplicação (não são mock). `completion_rules`, `enrollment_migration_details`.

### Contato público
`public_contact_requests`.

## 8. Convenções

- `created_at` / `updated_at` em tabelas de negócio.
- Sem DELETE físico de histórico no app.
- `mysql2` lê DATE/DATETIME no fuso local do processo Node (`utils/appConfig.js`).
- Collation alvo: `utf8mb4_0900_ai_ci`.
