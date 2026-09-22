# Notificações administrativas e indicadores do dashboard

Este documento cobre a evolução do sistema de notificações do CourseHub
para gerar eventos administrativos úteis (cadastros, matrículas,
financeiro, requerimentos, contatos) e a relação — deliberadamente
frouxa — entre esses eventos e os indicadores do dashboard admin.

Toda a implementação reutiliza a infraestrutura de notificações já
existente (`notificationTypeRegistry.js`, `createNotificationEvent`,
`notification_recipients`, `notification_deliveries`,
`notificationQueryService.js`, o worker de e-mail, `NotificationCenterPage`/
`useNotificationInbox`/`NotificationFilters`/`apiFetch`). Nenhum sistema
paralelo foi criado.

## 1. `type` ≠ `category`

- **`category`** é a área estável do negócio à qual o evento pertence.
  É usada para filtrar o inbox (`GET /api/notifications?category=...`)
  e para agrupar indicadores conceitualmente no dashboard — mas nunca
  para calculá-los.
- **`type`** é o acontecimento específico dentro dessa área. Cada
  `type` tem seu próprio título, mensagem, prioridade, política de
  e-mail e `deduplicationKey`.

Um novo `type` quase sempre é natural (um novo acontecimento de
negócio); uma nova `category` deve ser rara (uma nova área estável).
Esta implementação não cria uma categoria por evento — os ~13 novos
`type`s administrativos se distribuem em apenas 4 categorias novas.

## 2. Categorias

Categorias já existentes antes desta mudança (uso continua igual,
nenhuma foi alterada): `financial` (eventos financeiros voltados ao
aluno), `chat`, `calendar`, `learning`.

Categorias administrativas novas, todas voltadas a `role='admin'`:

| category | label (frontend) | área |
|---|---|---|
| `registration` | Cadastros | novos usuários (aluno/professor/admin) |
| `enrollment` | Matrículas | checkout concluído / matrícula manual |
| `financial` | Financeiro | reaproveitada — pagamento rejeitado, faturas em atraso |
| `request` | Requerimentos | tickets `administrative_support` |
| `contact` | Contatos | formulário público de contato |

`financial` é deliberadamente reaproveitada em vez de criar
`admin_financial`: é a mesma área de negócio, só que agora também
alcança administradores além de alunos — o filtro por destinatário já
é feito por `notification_recipients`, então não há risco de um aluno
ver uma notificação financeira endereçada a um admin ou vice-versa.

Mapeamento de labels centralizado em
`coursehub/src/constants/notificationCategories.js`
(`NOTIFICATION_CATEGORY_LABELS`, `ADMIN_NOTIFICATION_CATEGORY_FILTERS`)
— nenhum componente deve declarar essas strings localmente.

## 3. Resolver de admins

`resolveAllActiveAdmins(runner)` em
`backend/services/notifications/notificationRecipientResolvers.js`:

```sql
SELECT u.id AS user_id, u.name, u.email
FROM users u
WHERE u.role = 'admin' AND u.status = 'active'
```

Não existe tabela `admins` separada (diferente de `students`/
`teachers`) — um admin é só uma linha de `users` com `role='admin'`.
Saída normalizada igual aos demais resolvers: `{userId, role, name, email}[]`.
Todo evento administrativo cuja audiência é "todos os admins ativos"
usa este resolver — nenhum evento duplica essa query.

## 4. Regra: notification não é source of truth

Indicadores do dashboard (`operations{}` em `adminDashboardService.js`)
são sempre calculados a partir das tabelas de domínio
(`users`, `enrollments`, `financial_contracts`, `invoices`, `payments`,
`chat_conversations`, `public_contact_requests`) — nunca por
`COUNT(*) FROM notifications`/`notification_recipients`. Arquivar,
marcar como lida, ou a ausência de destinatário nunca altera um
indicador.

Exemplo:

- Evento individual "Maria concluiu o checkout de React." → vem de
  `notifications` (`admin.checkout.completed`).
- Indicador "12 novas matrículas nos últimos 7 dias" → vem de
  `enrollments`/`financial_contracts`, contado direto, independente de
  quantas notificações foram de fato criadas/lidas/arquivadas.

## 5. Tabela de tipos administrativos

*(preenchida progressivamente conforme cada fase é implementada)*

| type | category | trigger | audience | priority | email | dedup key | deep link | dashboard source |
|---|---|---|---|---|---|---|---|---|
| `administrative.request.created` | `request` | `openAdministrativeTicket` (ticket persistido) | `resolveAllActiveAdmins()` | normal | `default_off` | `admin:request-created:{conversationId}` | `/admin/chat?conversationId=` | `openAdministrativeRequests`/`unassignedAdministrativeRequests` vêm de `chat_conversations`, não desta notificação |
| `administrative.request.message_received` | `request` | `createMessage`/`createConversation`, quando `conversationType==='administrative_support'` | `resolveOtherActiveParticipants` | normal | `default_off` | `admin:request-message:{messageId}` | `/admin/chat?conversationId=` (admin) / `/aluno/chat` (aluno) | n/a (evento, não indicador) |
| `admin.user.created` | `registration` | `createStudent`/`registerStudent`/`createTeacher`/`createAdminUser` (nunca o stub de checkout) | `resolveAllActiveAdmins()` | normal | `default_off` | `admin:user-created:{userId}` | listagem do papel (`/admin/alunos`, `/admin/professores`, `/admin/usuarios`) | `operations.newUsersLast7Days` vem de `users.created_at`, não desta notificação |
| `admin.checkout.completed` | `enrollment` | `activateContractFromPaidInvoice` (activated=true), quando `financial_contracts.origin` é checkout | `resolveAllActiveAdmins()` | normal | `default_off` | `admin:checkout-completed:{enrollmentId}` | `/admin/financeiro/contratos/{contractId}` | `operations.completedCheckoutsLast7Days` vem de `enrollments`+`financial_contracts.origin`, não desta notificação |
| `admin.enrollment.created` | `enrollment` | mesmo ponto acima quando origin NÃO é checkout, + `adminEnrollmentService.createEnrollment` + bolsa/cortesia/migração (`adminManualEnrollmentService.js`) | `resolveAllActiveAdmins()` | normal | `default_off` | `admin:enrollment-created:{enrollmentId}` | `/admin/financeiro/contratos/{contractId}` ou `/admin/matriculas` | `operations.newEnrollmentsLast7Days` vem de `enrollments.created_at` |
| `admin.payment.rejected` | `financial` | `paymentProcessingService.applyTerminalNonApproval` (webhook, só 'rejected') + `invoicePaymentService.js` (rejeição síncrona, ex. cartão recusado na hora) | `resolveAllActiveAdmins()` | high | `default_off` | `admin:payment-rejected:{paymentId}` | `/admin/financeiro/contratos/{contractId}` | n/a (evento pontual, não indicador) |
| `admin.financial.invoice.overdue` | `financial` | `invoiceCollectionActionService.js`, ação `marked_overdue` (mesma transição que gera `financial.invoice.overdue`) | `resolveAllActiveAdmins()` | normal | `default_off` | `admin:invoice-overdue:{invoiceId}` | `/admin/financeiro/cobrancas` | `operations.overdueInvoices` vem de `invoices.status='overdue'` |
| `admin.financial.invoice.overdue_15_days` | `financial` | ação `lock_warning_15_days` (incondicional, sem flag) | `resolveAllActiveAdmins()` | high | `default_off` | `admin:invoice-overdue-15:{invoiceId}` | `/admin/financeiro/cobrancas` | `operations.invoicesOverdue15Days` vem de `invoices.due_date` |
| `admin.financial.invoice.overdue_30_days` | `financial` | ação `enrollment_locked_30_days`, **sempre** disparado independente de `ENABLE_ENROLLMENT_AUTO_LOCK` (`enrollmentWasAutoLocked` no context reflete se o bloqueio de fato aconteceu) | `resolveAllActiveAdmins()` | urgent | `essential` | `admin:invoice-overdue-30:{invoiceId}` | `/admin/financeiro/cobrancas` | `operations.invoicesOverdue30Days` vem de `invoices.due_date`, nunca do bloqueio |

| `admin.contact.created` | `contact` | `publicContactService.createContactRequest` (após persistir) | `resolveAllActiveAdmins()` | normal | `default_off` | `admin:contact-created:{contactRequestId}` | `/admin/contatos` | `operations.newPublicContacts` vem de `public_contact_requests.status='new'` |

Entidade nova: `public_contact_requests` (migration `20260828_001`),
não havia nada equivalente no projeto antes (confirmado por grep em
`database/migrations`, `backend/routes`, `backend/services`). Endpoint
público `POST /api/public/contact` (rate limit por IP + por e-mail,
mesmo padrão duplo de `invoicePaymentLinkRecovery*RateLimiter`), rota
admin `GET/PATCH /api/admin/contacts`, página `/admin/contatos`
(listagem simples via `ManagementPageShell`, sem atribuição/thread). O
snapshot da notificação carrega só o assunto, nunca o corpo completo
da mensagem (até 2000 caracteres).

### Nota: milestone financeiro × bloqueio automático (seção 7.4)

`admin.financial.invoice.overdue_30_days` e `financial.enrollment.locked`
são dois eventos deliberadamente independentes, mesmo nascendo do
mesmo `action_type='enrollment_locked_30_days'`: o primeiro sempre
dispara quando a ação é processada (é só um fato: "a fatura chegou a
30 dias"); o segundo só dispara quando `ENABLE_ENROLLMENT_AUTO_LOCK=true`
E o bloqueio de fato aconteceu agora. Antes desta mudança, os dois
eram a mesma coisa (com a flag desligada, nada era notificado). O
`finalStatus`/status da própria `invoice_collection_actions` continua
representando só o que aconteceu com o bloqueio em si (processed
quando bloqueou agora, skipped quando a flag está desligada ou já
estava bloqueada por outro caminho) -- não foi alterado, para não
quebrar a semântica que os testes existentes já verificavam.

## 6. Filtros do inbox admin

`GET /api/notifications?category=...&status=...` já suportava
`category` no backend antes desta mudança (`notificationQueryService.js`)
-- o trabalho aqui foi só na camada de UI:

- `useNotificationInbox` ganhou estado `category` (independente de
  `status`), convertendo `"all"` para `undefined` antes de chamar
  `listNotifications` (a API não entende o literal `"all"`).
- `NotificationFilters` ganhou os props opcionais `categories`/
  `category`/`onCategoryChange` -- quando `categories` não é passado
  (aluno/professor), o componente renderiza exatamente como antes,
  só a barra de status.
- `NotificationsAdmin.jsx` é o único chamador que passa
  `categories={ADMIN_NOTIFICATION_CATEGORY_FILTERS}` a
  `NotificationCenterPage`.
- `NotificationItem` ganhou um badge discreto de categoria (via
  `getNotificationCategoryLabel`), visível para todos os papéis.

Status e categoria são filtros genuinamente independentes (mesma
query, duas condições `WHERE`) -- "Financeiro + Não lidas" funciona
sem reload de página, com paginação por cursor preservada.

## 7. `operations{}` no dashboard admin

`GET /api/admin/dashboard` (`adminDashboardService.getAdminDashboard`)
ganhou uma seção `operations{}`, sempre calculada das tabelas de
domínio -- `getOperationsSummary(db)` é exportado separadamente para
ser testável sem depender do payload inteiro do dashboard.

| campo | fonte | definição |
|---|---|---|
| `newUsersLast7Days` | `users.created_at` | qualquer novo usuário (todos os papéis) nos últimos 7 dias |
| `newEnrollmentsLast7Days` | `enrollments.created_at` | qualquer matrícula criada nos últimos 7 dias, independente do status atual |
| `completedCheckoutsLast7Days` | `enrollments.activated_at` + `financial_contracts.origin` | só enrollments cujo contrato tem origin `public_checkout`/`authenticated_checkout` |
| `overdueInvoices` | `invoices` | mesma definição que `financial.overdueInvoices` (`adminFinancialReadService.js`) -- nunca duas regras divergentes para "em atraso" |
| `invoicesOverdue15Days` / `invoicesOverdue30Days` | `invoices` | mesmo critério acima, com piso adicional em `DATEDIFF(CURDATE(), due_date)` |
| `openAdministrativeRequests` | `chat_conversations` | `type='administrative_support' AND status NOT IN ('resolved','closed')` |
| `unassignedAdministrativeRequests` | `chat_conversations` | mesma query de `systemHealthService.getChatQueueHealth` |
| `newPublicContacts` | `public_contact_requests` | `status='new'` |

`administrativePendingItems` (widget "Pendências" já existente) foi
evoluído para incluir, quando `count > 0`: requerimentos sem
responsável, faturas 15+/30+ dias, novos contatos -- reaproveitando os
números já calculados por `operations`, sem repetir nenhuma query.

Frontend (`DashboardAdmin.jsx`): nova seção "Operação recente" (3
indicadores), "Resumo financeiro" ganhou uma linha com as contagens de
15+/30+ dias, e uma nova seção "Atendimento" (requerimentos abertos,
sem responsável, novos contatos, cada um linkando para a tela
correspondente). A lista "Pendências" já existente continua
funcionando automaticamente (ela só mapeia `administrativePendingItems`).

## 8. Fluxo especial: `administrative_support` sem admin atribuído

`openAdministrativeTicket()` cria a conversa com **apenas o aluno**
como `chat_participants` (`assigned_user_id IS NULL`). O pipeline
genérico `chat.message.received` (via `resolveOtherActiveParticipants`)
não notifica ninguém nesse momento, porque não há nenhum admin
participante ainda para resolver. Por isso `administrative.request.created`
é disparado diretamente em `openAdministrativeTicket`, usando
`resolveAllActiveAdmins` em vez de qualquer resolver baseado em
`chat_participants` — todos os admins ativos recebem a notificação
mesmo sem nenhum ter sido atribuído, e o ticket continua
`waiting_staff`/não atribuído normalmente. Notificação e atribuição
são decisões independentes; a criação do ticket nunca atribui um admin
automaticamente.
