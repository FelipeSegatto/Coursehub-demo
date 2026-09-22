const {
  getFinancialDashboardSummary,
} = require("../financial/adminFinancialReadService");

const {
  aggregateCalendarEvents,
} = require("../calendar/calendarAggregationService");

const { formatDateOnly } = require("../../utils/appConfig");

const UPCOMING_WINDOW_DAYS = 7;
const UPCOMING_EVENTS_LIMIT = 8;

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);

  return result;
}

async function getAcademicSummary(db) {
  const [rows] = await db.promise().query(
    `
      SELECT
        (SELECT COUNT(*) FROM users WHERE status = 'active') AS active_users,
        (SELECT COUNT(*) FROM students WHERE status = 'active') AS active_students,
        (SELECT COUNT(*) FROM teachers WHERE status = 'active') AS active_teachers,
        (SELECT COUNT(*) FROM courses WHERE status = 'active') AS active_courses,
        (SELECT COUNT(*) FROM classes WHERE status = 'active') AS active_classes,
        (SELECT COUNT(*) FROM enrollments WHERE status = 'active') AS active_enrollments,
        (SELECT COUNT(*) FROM activities WHERE status = 'active') AS open_activities,
        (SELECT COUNT(*) FROM submissions WHERE status IN ('submitted', 'pending_review'))
          AS pending_submissions
    `
  );

  const row = rows[0] || {};

  return {
    activeUsers: Number(row.active_users || 0),
    activeStudents: Number(row.active_students || 0),
    activeTeachers: Number(row.active_teachers || 0),
    activeCourses: Number(row.active_courses || 0),
    activeClasses: Number(row.active_classes || 0),
    activeEnrollments: Number(row.active_enrollments || 0),
    openActivities: Number(row.open_activities || 0),
    pendingSubmissions: Number(row.pending_submissions || 0),
  };
}

/**
 * Pendências administrativas reais — só itens com regra objetiva
 * confirmada no schema. Um curso "sem professor" é informativo, não
 * um erro (um curso pode legitimamente existir sem professor
 * vinculado).
 *
 * "Sem professor" agora significa nenhuma linha ATIVA em
 * course_teachers -- a fonte oficial de membership desde a migração
 * para N:N -- em vez de courses.teacher_id IS NULL. O backfill da
 * migration já sincronizou todo curso que tinha teacher_id, então na
 * prática os dois critérios coincidem logo após a migração; podem
 * divergir temporariamente só se algo escrever courses.teacher_id
 * diretamente sem passar por courseTeacherService (ver
 * docs/course-teacher-model.md).
 */
async function listAdministrativePendingItems(db) {
  const [rows] = await db.promise().query(
    `
      SELECT
        (
          SELECT COUNT(*) FROM courses c
          WHERE c.status = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM course_teachers ct
              WHERE ct.course_id = c.id AND ct.status = 'active'
            )
        ) AS courses_without_teacher,
        (SELECT COUNT(*) FROM class_sessions
          WHERE status = 'scheduled' AND session_date < CURDATE())
          AS sessions_past_without_attendance
    `
  );

  const row = rows[0] || {};
  const items = [];

  const coursesWithoutTeacher = Number(row.courses_without_teacher || 0);
  const sessionsPastWithoutAttendance = Number(row.sessions_past_without_attendance || 0);

  if (coursesWithoutTeacher > 0) {
    items.push({
      type: "courses_without_teacher",
      label: "Cursos ativos sem professor responsável",
      count: coursesWithoutTeacher,
      deepLink: "/admin/cursos",
    });
  }

  if (sessionsPastWithoutAttendance > 0) {
    items.push({
      type: "sessions_past_without_attendance",
      label: "Encontros passados ainda marcados como agendados",
      count: sessionsPastWithoutAttendance,
      deepLink: null,
    });
  }

  return items;
}

/**
 * Indicadores de "operação recente" + atendimento, todos calculados
 * direto das tabelas de domínio (users/enrollments/financial_contracts/
 * invoices/chat_conversations/public_contact_requests) -- NUNCA de
 * notifications/notification_recipients. Ver
 * docs/admin-notifications-and-indicators.md#4-regra-notification-não-é-source-of-truth:
 * arquivar/ler uma notificação, ou a ausência de qualquer notificação,
 * nunca muda nenhum destes números.
 *
 * "Aberto"/overdue usa a MESMA definição que
 * getFinancialDashboardSummary (adminFinancialReadService.js) já usa
 * para overdueInvoices -- status='overdue' OU (pending/processing
 * com due_date no passado) -- para que os dois números nunca
 * divirjam por uma regra reescrita duas vezes. 15/30 dias são o mesmo
 * critério de "dívida aberta", só com um piso adicional em
 * DATEDIFF(CURDATE(), due_date).
 *
 * unassignedAdministrativeRequests espelha exatamente a query já
 * usada por systemHealthService.getChatQueueHealth (mesma regra:
 * assigned_user_id IS NULL, status ainda não resolved/closed).
 */
async function getOperationsSummary(db) {
  const OPEN_DEBT_CONDITION = `
    status = 'overdue'
    OR (status IN ('pending', 'processing') AND due_date < CURDATE())
  `;

  const [rows] = await db.promise().query(
    `
      SELECT
        (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL 7 DAY)
          AS new_users_last_7_days,

        (SELECT COUNT(*) FROM enrollments WHERE created_at >= NOW() - INTERVAL 7 DAY)
          AS new_enrollments_last_7_days,

        (
          SELECT COUNT(*)
          FROM enrollments e
          INNER JOIN financial_contracts fc ON fc.enrollment_id = e.id
          WHERE fc.origin IN ('public_checkout', 'authenticated_checkout')
            AND e.activated_at >= NOW() - INTERVAL 7 DAY
        ) AS completed_checkouts_last_7_days,

        (SELECT COUNT(*) FROM invoices WHERE ${OPEN_DEBT_CONDITION})
          AS overdue_invoices,

        (SELECT COUNT(*) FROM invoices WHERE (${OPEN_DEBT_CONDITION}) AND DATEDIFF(CURDATE(), due_date) >= 15)
          AS invoices_overdue_15_days,

        (SELECT COUNT(*) FROM invoices WHERE (${OPEN_DEBT_CONDITION}) AND DATEDIFF(CURDATE(), due_date) >= 30)
          AS invoices_overdue_30_days,

        (SELECT COUNT(*) FROM chat_conversations
          WHERE type = 'administrative_support' AND status NOT IN ('resolved', 'closed'))
          AS open_administrative_requests,

        (SELECT COUNT(*) FROM chat_conversations
          WHERE type = 'administrative_support' AND assigned_user_id IS NULL AND status NOT IN ('resolved', 'closed'))
          AS unassigned_administrative_requests,

        (SELECT COUNT(*) FROM public_contact_requests WHERE status = 'new')
          AS new_public_contacts,

        -- Aluno com matrícula ativa mas sem turma vinculada -- não é
        -- "usuário student sem turma", é a matrícula acadêmica em si.
        (SELECT COUNT(*) FROM enrollments WHERE status = 'active' AND class_id IS NULL)
          AS students_without_class,

        -- "Matrícula pendente": a fatura de ativação do contrato já
        -- está paga, mas o contrato continua pending_payment (nunca
        -- transicionou para active) ou, tendo transicionado, a
        -- enrollment vinculada não está active -- exatamente o gap
        -- que activateContractFromPaidInvoice deveria ter fechado
        -- atomicamente. Contratos cancelled são excluídos de
        -- propósito (não é pendência, é encerramento deliberado -- a
        -- desistência/cancelamento já fecha os dois juntos). Nunca
        -- inclui contrato ainda genuinamente aguardando pagamento
        -- (a fatura de ativação, aí, também não está paga).
        (
          SELECT COUNT(*)
          FROM financial_contracts fc
          INNER JOIN invoices activation_invoice ON activation_invoice.id = fc.activation_invoice_id
          LEFT JOIN enrollments e ON e.id = fc.enrollment_id
          WHERE activation_invoice.status = 'paid'
            AND fc.status <> 'cancelled'
            AND (fc.enrollment_id IS NULL OR e.status <> 'active')
        ) AS pending_enrollments
    `
  );

  const row = rows[0] || {};

  return {
    newUsersLast7Days: Number(row.new_users_last_7_days || 0),
    newEnrollmentsLast7Days: Number(row.new_enrollments_last_7_days || 0),
    completedCheckoutsLast7Days: Number(row.completed_checkouts_last_7_days || 0),
    overdueInvoices: Number(row.overdue_invoices || 0),
    invoicesOverdue15Days: Number(row.invoices_overdue_15_days || 0),
    invoicesOverdue30Days: Number(row.invoices_overdue_30_days || 0),
    openAdministrativeRequests: Number(row.open_administrative_requests || 0),
    unassignedAdministrativeRequests: Number(row.unassigned_administrative_requests || 0),
    newPublicContacts: Number(row.new_public_contacts || 0),
    studentsWithoutClass: Number(row.students_without_class || 0),
    pendingEnrollments: Number(row.pending_enrollments || 0),
  };
}

/**
 * Endpoint agregado do dashboard administrativo. Executa 3
 * consultas de contagem (todas agregação, uma única ida ao banco
 * cada) + reaproveita getFinancialDashboardSummary já existente
 * (2 queries internas, nada duplicado) + 1 chamada ao agregador de
 * calendário — todas em paralelo via Promise.all.
 */
async function getAdminDashboard(db, userId) {
  const today = formatDateOnly(new Date());
  const windowEnd = formatDateOnly(addDays(new Date(), UPCOMING_WINDOW_DAYS));

  const [academic, financial, courseAndSessionPendingItems, operations, calendarResult] =
    await Promise.all([
      getAcademicSummary(db),
      getFinancialDashboardSummary(db),
      listAdministrativePendingItems(db),
      getOperationsSummary(db),
      aggregateCalendarEvents(db, { role: "admin", userId, from: today, to: windowEnd }),
    ]);

  // Junta os itens de curso/turma (já existentes) com os novos itens
  // de atendimento/financeiro derivados de `operations` -- sem
  // repetir nenhuma das queries que operations já rodou.
  const administrativePendingItems = [...courseAndSessionPendingItems];

  if (operations.unassignedAdministrativeRequests > 0) {
    administrativePendingItems.push({
      type: "unassigned_administrative_requests",
      label: "Requerimentos sem responsável",
      count: operations.unassignedAdministrativeRequests,
      deepLink: "/admin/chat",
    });
  }

  if (operations.invoicesOverdue15Days > 0) {
    administrativePendingItems.push({
      type: "invoices_overdue_15_days",
      label: "Faturas com 15+ dias de atraso",
      count: operations.invoicesOverdue15Days,
      deepLink: "/admin/financeiro/cobrancas",
    });
  }

  if (operations.invoicesOverdue30Days > 0) {
    administrativePendingItems.push({
      type: "invoices_overdue_30_days",
      label: "Faturas com 30+ dias de atraso",
      count: operations.invoicesOverdue30Days,
      deepLink: "/admin/financeiro/cobrancas",
    });
  }

  if (operations.newPublicContacts > 0) {
    administrativePendingItems.push({
      type: "new_public_contacts",
      label: "Novos contatos recebidos",
      count: operations.newPublicContacts,
      deepLink: "/admin/contatos",
    });
  }

  return {
    summary: {
      activeUsers: academic.activeUsers,
      activeEnrollments: academic.activeEnrollments,
      activeCourses: academic.activeCourses,
      activeClasses: academic.activeClasses,
    },
    financial: {
      paidAmount: financial.totalReceived,
      openAmount: financial.totalPending,
      overdueAmount: financial.totalOverdue,
      overdueInvoices: financial.overdueInvoices,
    },
    academic: {
      activeStudents: academic.activeStudents,
      activeTeachers: academic.activeTeachers,
      openActivities: academic.openActivities,
      pendingSubmissions: academic.pendingSubmissions,
    },
    operations,
    administrativePendingItems,
    upcomingEvents: calendarResult.events.slice(0, UPCOMING_EVENTS_LIMIT),
  };
}

module.exports = {
  getAdminDashboard,
  getOperationsSummary,
};
