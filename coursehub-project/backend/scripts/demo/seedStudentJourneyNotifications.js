/**
 * Notificações da jornada da Marina, do Pedro, do Junior e da Larissa.
 *
 * Idempotente: a chave demo.student.journey:... não duplica linha.
 * O e-mail fica skipped para o worker não disparar a caixa de saída.
 *
 * Grava no banco ativo (DB_NAME). Com MYSQL_ROOT_PASSWORD, grava
 * também em DEMO_SNAPSHOT_DB, que é o que o logout restaura.
 *
 * Uso (backend):
 *   node scripts/demo/seedStudentJourneyNotifications.js
 *   $env:MYSQL_ROOT_PASSWORD="..."; node scripts/demo/seedStudentJourneyNotifications.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const mysql = require("mysql2/promise");
const { formatDateOnly } = require("../../utils/appConfig");

const MARINA_EMAIL = "marina.alves@email.com";
const PEDRO_EMAIL = "pedro.nogueira@email.com";
const ACTOR_EMAIL = "junior.galdino@email.com";
const LARISSA_EMAIL = "admin2@coursehub.com";
const NODE_FIRST_QUIZ = "Quiz: npm, scripts e o package.json";
const NODE_MIDDLEWARE = "Exercício: rotas e middleware no Express";
const REACT_FIRST_QUIZ = "Quiz: JSX e o primeiro componente";
const CHAT_TITLE = "Dúvida sobre middleware";
const PEDRO_CHAT_TITLE = "Dúvida sobre a avaliação de React";
const PEDRO_CHAT_BODY = "Professor, já enviei a avaliação parcial de Fundamentos de React. O useState devolve o valor novo na mesma renderização ou só na próxima?";
const NODE_QUIZ_TITLE = "Quiz rápido: req, res e a primeira rota";
const REACT_QUIZ_TITLE = "Atividade Final: o que o useState devolve";
const NODE_EXAM_TITLE = "Avaliação parcial — Express na prática";
const REACT_EXAM_TITLE = "Avaliação parcial — Fundamentos de React";
const JOURNEY_AS_OF = "2026-09-22";

function formatScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/, "");
}

function formatMoney(value) {
  return Number(value).toFixed(2);
}

async function one(conn, sql, params) {
  const [rows] = await conn.query(sql, params);
  return rows[0] || null;
}

async function requireRow(row, label) {
  if (!row) {
    throw new Error(`A jornada demo não tem o dado esperado: ${label}.`);
  }
  return row;
}

async function loadStudent(conn, email) {
  return requireRow(
    await one(
      conn,
      `SELECT u.id AS user_id, u.email, s.id AS student_id, u.name
       FROM users u
       INNER JOIN students s ON s.user_id = u.id
       WHERE u.email = ?
       LIMIT 1`,
      [email]
    ),
    email
  );
}

async function loadEnrollments(conn, studentId) {
  const [rows] = await conn.query(
    `SELECT e.course_id, e.class_id, c.name AS course_name, cl.name AS class_name
     FROM enrollments e
     INNER JOIN courses c ON c.id = e.course_id
     INNER JOIN classes cl ON cl.id = e.class_id
     WHERE e.student_id = ? AND e.status = 'active'
     ORDER BY e.id`,
    [studentId]
  );
  return rows;
}

async function loadActivity(conn, { title, courseId }) {
  return requireRow(
    await one(
      conn,
      `SELECT a.id, a.title, a.activity_kind, a.due_date, a.course_id, c.name AS course_name
       FROM activities a
       INNER JOIN courses c ON c.id = a.course_id
       WHERE a.title = ? AND a.course_id = ? AND a.status = 'active'
       ORDER BY a.id
       LIMIT 1`,
      [title, courseId]
    ),
    `${title} (curso ${courseId})`
  );
}

async function loadGrade(conn, { studentId, title }) {
  return requireRow(
    await one(
      conn,
      `SELECT g.id, g.score, g.max_score, g.feedback, a.id AS activity_id, a.title,
              a.activity_kind, a.course_id, c.name AS course_name
       FROM grades g
       INNER JOIN activities a ON a.id = g.activity_id
       INNER JOIN courses c ON c.id = a.course_id
       WHERE g.student_id = ? AND a.title = ?
       ORDER BY g.id DESC
       LIMIT 1`,
      [studentId, title]
    ),
    `nota de ${title}`
  );
}

async function loadInProgressContent(conn, { studentId, courseId }) {
  return one(
    conn,
    `SELECT cc.id, cc.title, cc.type, cc.course_id, c.name AS course_name
     FROM student_content_progress scp
     INNER JOIN course_contents cc ON cc.id = scp.content_id
     INNER JOIN courses c ON c.id = cc.course_id
     WHERE scp.student_id = ? AND scp.course_id = ? AND scp.status = 'in_progress'
     ORDER BY scp.updated_at DESC, cc.id DESC
     LIMIT 1`,
    [studentId, courseId]
  );
}

async function loadNextSession(conn, classId) {
  return one(
    conn,
    `SELECT cs.id, cs.title, cs.session_date, cs.start_time, cs.class_id,
            cl.name AS class_name, cl.course_id, c.name AS course_name
     FROM class_sessions cs
     INNER JOIN classes cl ON cl.id = cs.class_id
     INNER JOIN courses c ON c.id = cl.course_id
     WHERE cs.class_id = ? AND cs.status = 'scheduled' AND cs.session_date >= ?
     ORDER BY cs.session_date, cs.start_time, cs.id
     LIMIT 1`,
    [classId, JOURNEY_AS_OF]
  );
}

async function loadAbsence(conn, studentId) {
  return one(
    conn,
    `SELECT cs.id, cs.title, cs.session_date, cs.class_id,
            cl.name AS class_name, cl.course_id, c.name AS course_name
     FROM attendance att
     INNER JOIN class_sessions cs ON cs.id = att.class_session_id
     INNER JOIN classes cl ON cl.id = cs.class_id
     INNER JOIN courses c ON c.id = cl.course_id
     WHERE att.student_id = ? AND att.status = 'absent'
     ORDER BY cs.session_date DESC, cs.id DESC
     LIMIT 1`,
    [studentId]
  );
}

async function loadInvoice(conn, { studentId, status }) {
  return one(
    conn,
    `SELECT i.id, i.description, i.due_date, i.amount, e.course_id, e.class_id, c.name AS course_name
     FROM invoices i
     INNER JOIN financial_contracts fc ON fc.id = i.financial_contract_id
     INNER JOIN enrollments e ON e.id = fc.enrollment_id
     INNER JOIN courses c ON c.id = e.course_id
     WHERE e.student_id = ? AND i.status = ?
     ORDER BY i.due_date, i.id
     LIMIT 1`,
    [studentId, status]
  );
}

async function loadApprovedPayment(conn, { studentId, courseId }) {
  return one(
    conn,
    `SELECT p.id, p.amount, i.id AS invoice_id, i.description, e.course_id, e.class_id, c.name AS course_name
     FROM payments p
     INNER JOIN invoices i ON i.id = p.invoice_id
     INNER JOIN financial_contracts fc ON fc.id = i.financial_contract_id
     INNER JOIN enrollments e ON e.id = fc.enrollment_id
     INNER JOIN courses c ON c.id = e.course_id
     WHERE e.student_id = ? AND e.course_id = ? AND p.status = 'approved'
     ORDER BY p.paid_at, p.id
     LIMIT 1`,
    [studentId, courseId]
  );
}

function activityPath(activity) {
  return activity.activity_kind === "exam"
    ? `/aluno/avaliacoes/${activity.id}`
    : `/aluno/atividades/${activity.id}`;
}

function contentLabel(type) {
  return { video: "vídeo", pdf: "PDF", text: "texto", live_class: "aula ao vivo" }[type] || "conteúdo";
}

function buildEvents({ marina, pedro, actorUserId, marinaNode, pedroNode, pedroReact, nodeQuiz, reactQuiz, marinaGrade, pedroNodeGrade, marinaContent, pedroContent, nodeSession, absence, overdue, marinaPayment, pedroPayment }) {
  const events = [];

  if (marinaPayment) {
    events.push({
      userId: marina.user_id,
      email: marina.email,
      createdAt: "2026-08-18 14:20:00",
      type: "financial.payment.approved",
      category: "financial",
      priority: "normal",
      title: "Pagamento aprovado",
      message: `Recebemos o pagamento de R$ ${formatMoney(marinaPayment.amount)} referente à fatura "${marinaPayment.description}" (${marinaPayment.course_name}).`,
      sourceType: "payment",
      sourceId: marinaPayment.id,
      actorUserId: null,
      courseId: marinaPayment.course_id,
      classId: marinaPayment.class_id,
      actionPath: "/aluno/financeiro",
    });
  }

  if (pedroPayment) {
    events.push({
      userId: pedro.user_id,
      email: pedro.email,
      createdAt: "2026-08-18 14:20:00",
      type: "financial.payment.approved",
      category: "financial",
      priority: "normal",
      title: "Pagamento aprovado",
      message: `Recebemos o pagamento de R$ ${formatMoney(pedroPayment.amount)} referente à fatura "${pedroPayment.description}" (${pedroPayment.course_name}).`,
      sourceType: "payment",
      sourceId: pedroPayment.id,
      actorUserId: null,
      courseId: pedroPayment.course_id,
      classId: pedroPayment.class_id,
      actionPath: "/aluno/financeiro",
    });
  }

  events.push({
    userId: marina.user_id,
    email: marina.email,
    createdAt: "2026-09-17 11:00:00",
    type: "learning.grade.published",
    category: "learning",
    priority: "normal",
    title: `Nota publicada: ${marinaGrade.title}`,
    message: `Sua nota da ${marinaGrade.activity_kind === "exam" ? "avaliação" : "atividade"} "${marinaGrade.title}" (${marinaGrade.course_name}) foi publicada: ${formatScore(marinaGrade.score)}/${formatScore(marinaGrade.max_score)}.`,
    sourceType: "grade",
    sourceId: marinaGrade.id,
    actorUserId,
    courseId: marinaGrade.course_id,
    classId: marinaNode.class_id,
    actionPath: "/aluno/notas",
  });

  events.push({
    userId: pedro.user_id,
    email: pedro.email,
    createdAt: "2026-09-17 11:05:00",
    type: "learning.grade.published",
    category: "learning",
    priority: "normal",
    title: `Nota publicada: ${pedroNodeGrade.title}`,
    message: `Sua nota da ${pedroNodeGrade.activity_kind === "exam" ? "avaliação" : "atividade"} "${pedroNodeGrade.title}" (${pedroNodeGrade.course_name}) foi publicada: ${formatScore(pedroNodeGrade.score)}/${formatScore(pedroNodeGrade.max_score)}.`,
    sourceType: "grade",
    sourceId: pedroNodeGrade.id,
    actorUserId,
    courseId: pedroNodeGrade.course_id,
    classId: pedroNode.class_id,
    actionPath: "/aluno/notas",
  });

  if (absence) {
    events.push({
      userId: pedro.user_id,
      email: pedro.email,
      createdAt: "2026-09-18 21:10:00",
      type: "learning.attendance.flagged",
      category: "learning",
      priority: "normal",
      title: "Frequência registrada",
      message: `Você foi marcado(a) como ausente no encontro "${absence.title}" (${absence.class_name}, ${absence.course_name}) em ${formatDateOnly(absence.session_date)}.`,
      sourceType: "class_session",
      sourceId: absence.id,
      actorUserId,
      courseId: absence.course_id,
      classId: absence.class_id,
      actionPath: "/aluno/progresso",
    });
  }

  events.push({
    userId: pedro.user_id,
    email: pedro.email,
    createdAt: "2026-09-10 08:05:00",
    type: "financial.invoice.overdue",
    category: "financial",
    priority: "high",
    title: "Fatura vencida",
    message: `A fatura "${overdue.description}" (${overdue.course_name}) venceu em ${formatDateOnly(overdue.due_date)} e ainda não foi paga.`,
    sourceType: "invoice",
    sourceId: overdue.id,
    actorUserId: null,
    courseId: overdue.course_id,
    classId: overdue.class_id,
    actionPath: "/aluno/financeiro",
  });

  return events.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.email.localeCompare(right.email));
}

async function loadUser(conn, email) {
  return requireRow(
    await one(conn, `SELECT id AS user_id, email, name FROM users WHERE email = ? LIMIT 1`, [email]),
    email
  );
}

async function loadSubmission(conn, { studentId, title }) {
  return one(
    conn,
    `SELECT s.id, a.title, a.activity_kind, a.course_id, c.name AS course_name
     FROM submissions s
     INNER JOIN activities a ON a.id = s.activity_id
     INNER JOIN courses c ON c.id = a.course_id
     WHERE s.student_id = ? AND a.title = ?
     ORDER BY s.id DESC
     LIMIT 1`,
    [studentId, title]
  );
}

async function loadChatFromStudent(conn, { title, senderEmail }) {
  return one(
    conn,
    `SELECT m.id, m.body, cc.course_id, cc.class_id
     FROM chat_messages m
     INNER JOIN chat_conversations cc ON cc.id = m.conversation_id
     INNER JOIN users u ON u.id = m.sender_user_id
     WHERE cc.title = ? AND u.email = ? AND m.deleted_at IS NULL
     ORDER BY m.id DESC
     LIMIT 1`,
    [title, senderEmail]
  );
}

async function loadPaymentDetail(conn, { studentId, courseId }) {
  return one(
    conn,
    `SELECT p.id, p.amount, p.payment_method, i.description, e.course_id, e.class_id,
            c.name AS course_name, fc.id AS contract_id, u.name AS student_name
     FROM payments p
     INNER JOIN invoices i ON i.id = p.invoice_id
     INNER JOIN financial_contracts fc ON fc.id = i.financial_contract_id
     INNER JOIN enrollments e ON e.id = fc.enrollment_id
     INNER JOIN courses c ON c.id = e.course_id
     INNER JOIN students s ON s.id = e.student_id
     INNER JOIN users u ON u.id = s.user_id
     WHERE e.student_id = ? AND e.course_id = ? AND p.status = 'approved'
     ORDER BY p.paid_at, p.id
     LIMIT 1`,
    [studentId, courseId]
  );
}

function gradeEvent({ user, createdAt, grade, classId, actorUserId }) {
  return {
    userId: user.user_id,
    email: user.email,
    createdAt,
    type: "learning.grade.published",
    category: "learning",
    priority: "normal",
    title: `Nota publicada: ${grade.title}`,
    message: `Sua nota da ${grade.activity_kind === "exam" ? "avaliação" : "atividade"} "${grade.title}" (${grade.course_name}) foi publicada: ${formatScore(grade.score)}/${formatScore(grade.max_score)}.`,
    sourceType: "grade",
    sourceId: grade.id,
    actorUserId,
    courseId: grade.course_id,
    classId,
    actionPath: "/aluno/notas",
  };
}

function submissionEvent({ teacher, createdAt, submission, studentName, classId }) {
  const kindLabel = submission.activity_kind === "exam" ? "avaliação" : "atividade";
  const kindTitle = submission.activity_kind === "exam" ? "Avaliação" : "Atividade";

  return {
    userId: teacher.user_id,
    email: teacher.email,
    createdAt,
    type: "learning.submission.received",
    category: "learning",
    priority: "normal",
    title: `${kindTitle} recebida: ${submission.title}`,
    message: `${studentName} enviou a ${kindLabel} "${submission.title}" do curso ${submission.course_name}. Está pendente de correção.`,
    sourceType: "submission",
    sourceId: submission.id,
    actorUserId: null,
    courseId: submission.course_id,
    classId,
    actionPath: `/professor/envios/${submission.id}/corrigir`,
  };
}

function paymentReceivedEvent({ admin, createdAt, payment }) {
  const method = payment.payment_method ? ` via ${payment.payment_method}` : "";

  return {
    userId: admin.user_id,
    email: admin.email,
    createdAt,
    type: "admin.financial.payment.received",
    category: "financial",
    priority: "normal",
    title: "Pagamento recebido",
    message: `${payment.student_name} pagou R$ ${formatMoney(payment.amount)}${method} (${payment.course_name}).`,
    sourceType: "payment",
    sourceId: payment.id,
    actorUserId: null,
    courseId: payment.course_id,
    classId: payment.class_id,
    actionPath: `/admin/financeiro/contratos/${payment.contract_id}`,
  };
}

function welcomeEvent({ user, createdAt, enrollment, feminine }) {
  const hello = feminine ? "Bem-vinda" : "Bem-vindo";

  return {
    userId: user.user_id,
    email: user.email,
    createdAt,
    type: "academic.enrollment.welcome",
    category: "learning",
    priority: "normal",
    title: `${hello} ao curso ${enrollment.course_name}`,
    message: `${hello} à turma ${enrollment.class_name}. O semestre começa em agosto: atividades, avaliações e vencimentos passam a aparecer por aqui.`,
    sourceType: "course",
    sourceId: enrollment.course_id,
    actorUserId: null,
    courseId: enrollment.course_id,
    classId: enrollment.class_id,
    actionPath: `/aluno/dashboard-aluno/courses/${enrollment.course_id}`,
  };
}

function publishedEvent({ user, createdAt, activity, classId, actorUserId }) {
  const exam = activity.activity_kind === "exam";
  const due = activity.due_date ? ` Prazo: ${formatDateOnly(activity.due_date)}.` : "";

  return {
    userId: user.user_id,
    email: user.email,
    createdAt,
    type: "learning.activity.published",
    category: "learning",
    priority: "normal",
    title: `${exam ? "Nova avaliação" : "Nova atividade"}: ${activity.title}`,
    message: `Uma nova ${exam ? "avaliação" : "atividade"} foi publicada no curso ${activity.course_name}: "${activity.title}".${due}`,
    sourceType: "activity",
    sourceId: activity.id,
    actorUserId,
    courseId: activity.course_id,
    classId,
    actionPath: activityPath(activity),
  };
}

function buildContinuedStory(context) {
  const {
    marina, pedro, junior, larissa, actorUserId,
    marinaNode, pedroNode, pedroReact, overdue,
    marinaFirstGrade, pedroFirstGrade, pedroReactGrade, pedroReactExamGrade,
    marinaMiddlewareSubmission, marinaExamSubmission, pedroReactExamSubmission,
    chatMessage, pedroChatMessage, marinaPaymentDetail, pedroNodePayment, pedroReactPayment,
    nodeFirstQuiz, nodeMiddlewareActivity, nodeExam, reactFirstQuiz, reactExam,
  } = context;
  const events = [];

  events.push(welcomeEvent({ user: marina, createdAt: "2026-08-03 09:00:00", enrollment: marinaNode, feminine: true }));
  events.push(welcomeEvent({ user: pedro, createdAt: "2026-08-03 09:05:00", enrollment: pedroNode, feminine: false }));
  events.push(welcomeEvent({ user: pedro, createdAt: "2026-08-03 09:06:00", enrollment: pedroReact, feminine: false }));
  events.push({
    userId: junior.user_id,
    email: junior.email,
    createdAt: "2026-08-03 09:10:00",
    type: "academic.enrollment.welcome",
    category: "learning",
    priority: "normal",
    title: "Suas turmas de agosto estão abertas",
    message: `Node (${marinaNode.class_name}) e React (${pedroReact.class_name}) começam o semestre. Envios, notas e mensagens da turma aparecem por aqui.`,
    sourceType: "class",
    sourceId: marinaNode.class_id,
    actorUserId: null,
    courseId: marinaNode.course_id,
    classId: marinaNode.class_id,
    actionPath: "/professor/dashboard-professor",
  });
  events.push({
    userId: larissa.user_id,
    email: larissa.email,
    createdAt: "2026-08-03 09:15:00",
    type: "academic.enrollment.welcome",
    category: "learning",
    priority: "normal",
    title: "Semestre de agosto iniciado",
    message: "Marina Alves e Pedro Nogueira estão matriculados. Pagamentos já recebidos e vencimentos do semestre aparecem nesta caixa.",
    sourceType: "course",
    sourceId: marinaNode.course_id,
    actorUserId: null,
    courseId: marinaNode.course_id,
    classId: marinaNode.class_id,
    actionPath: "/admin/dashboard-admin",
  });

  if (nodeFirstQuiz) {
    events.push(publishedEvent({ user: marina, createdAt: "2026-08-10 09:00:00", activity: nodeFirstQuiz, classId: marinaNode.class_id, actorUserId }));
    events.push(publishedEvent({ user: pedro, createdAt: "2026-08-10 09:00:00", activity: nodeFirstQuiz, classId: pedroNode.class_id, actorUserId }));
  }
  if (reactFirstQuiz) {
    events.push(publishedEvent({ user: pedro, createdAt: "2026-08-12 09:00:00", activity: reactFirstQuiz, classId: pedroReact.class_id, actorUserId }));
  }
  if (nodeMiddlewareActivity) {
    events.push(publishedEvent({ user: marina, createdAt: "2026-08-26 09:00:00", activity: nodeMiddlewareActivity, classId: marinaNode.class_id, actorUserId }));
    events.push(publishedEvent({ user: pedro, createdAt: "2026-08-26 09:00:00", activity: nodeMiddlewareActivity, classId: pedroNode.class_id, actorUserId }));
  }
  if (nodeExam) {
    events.push(publishedEvent({ user: marina, createdAt: "2026-09-08 09:00:00", activity: nodeExam, classId: marinaNode.class_id, actorUserId }));
    events.push(publishedEvent({ user: pedro, createdAt: "2026-09-08 09:00:00", activity: nodeExam, classId: pedroNode.class_id, actorUserId }));
  }
  if (reactExam) {
    events.push(publishedEvent({ user: pedro, createdAt: "2026-09-09 09:00:00", activity: reactExam, classId: pedroReact.class_id, actorUserId }));
  }

  if (marinaPaymentDetail) events.push(paymentReceivedEvent({ admin: larissa, createdAt: "2026-08-18 14:25:00", payment: marinaPaymentDetail }));
  if (pedroNodePayment) events.push(paymentReceivedEvent({ admin: larissa, createdAt: "2026-08-18 14:26:00", payment: pedroNodePayment }));
  if (pedroReactPayment) events.push(paymentReceivedEvent({ admin: larissa, createdAt: "2026-08-18 14:27:00", payment: pedroReactPayment }));
  if (marinaFirstGrade) events.push(gradeEvent({ user: marina, createdAt: "2026-08-25 16:00:00", grade: marinaFirstGrade, classId: marinaNode.class_id, actorUserId }));
  if (pedroFirstGrade) events.push(gradeEvent({ user: pedro, createdAt: "2026-08-25 16:05:00", grade: pedroFirstGrade, classId: pedroNode.class_id, actorUserId }));
  if (marinaMiddlewareSubmission) {
    events.push(submissionEvent({
      teacher: junior,
      createdAt: "2026-09-03 19:40:00",
      submission: marinaMiddlewareSubmission,
      studentName: marina.name,
      classId: marinaNode.class_id,
    }));
  }
  if (pedroReactGrade) events.push(gradeEvent({ user: pedro, createdAt: "2026-09-04 11:00:00", grade: pedroReactGrade, classId: pedroReact.class_id, actorUserId }));

  events.push({
    userId: pedro.user_id,
    email: pedro.email,
    createdAt: "2026-09-07 09:00:00",
    type: "financial.invoice.reminder",
    category: "financial",
    priority: "normal",
    title: "Fatura vence em breve",
    message: `A fatura "${overdue.description}" (${overdue.course_name}) vence em ${formatDateOnly(overdue.due_date)}.`,
    sourceType: "invoice",
    sourceId: overdue.id,
    actorUserId: null,
    courseId: overdue.course_id,
    classId: overdue.class_id,
    actionPath: "/aluno/financeiro",
  });
  events.push({
    userId: larissa.user_id,
    email: larissa.email,
    createdAt: "2026-09-10 08:15:00",
    type: "admin.financial.invoice.overdue",
    category: "financial",
    priority: "normal",
    title: "Fatura em atraso",
    message: `${pedro.name} possui uma cobrança vencida de R$ ${formatMoney(overdue.amount)}.`,
    sourceType: "invoice",
    sourceId: overdue.id,
    actorUserId: null,
    courseId: overdue.course_id,
    classId: overdue.class_id,
    actionPath: "/admin/financeiro/cobrancas",
  });

  if (marinaExamSubmission) {
    events.push(submissionEvent({
      teacher: junior,
      createdAt: "2026-09-16 20:10:00",
      submission: marinaExamSubmission,
      studentName: marina.name,
      classId: marinaNode.class_id,
    }));
  }
  if (pedroReactExamSubmission) {
    events.push(submissionEvent({
      teacher: junior,
      createdAt: "2026-09-18 21:30:00",
      submission: pedroReactExamSubmission,
      studentName: pedro.name,
      classId: pedroReact.class_id,
    }));
  }
  if (pedroReactExamGrade) events.push(gradeEvent({ user: pedro, createdAt: "2026-09-19 11:00:00", grade: pedroReactExamGrade, classId: pedroReact.class_id, actorUserId }));

  if (chatMessage) {
    const preview = String(chatMessage.body || "").trim();
    events.push({
      userId: junior.user_id,
      email: junior.email,
      createdAt: "2026-09-20 15:12:00",
      type: "chat.message.received",
      category: "chat",
      priority: "normal",
      title: `Nova mensagem de ${marina.name}`,
      message: preview.length > 140 ? `${preview.slice(0, 140)}...` : preview,
      sourceType: "chat_message",
      sourceId: chatMessage.id,
      actorUserId: marina.user_id,
      courseId: chatMessage.course_id || marinaNode.course_id,
      classId: chatMessage.class_id || marinaNode.class_id,
      actionPath: "/professor/chat",
    });
  }

  if (pedroChatMessage) {
    const preview = String(pedroChatMessage.body || "").trim();
    events.push({
      userId: junior.user_id,
      email: junior.email,
      createdAt: "2026-09-22 16:40:00",
      type: "chat.message.received",
      category: "chat",
      priority: "normal",
      title: `Nova mensagem de ${pedro.name}`,
      message: preview.length > 140 ? `${preview.slice(0, 140)}...` : preview,
      sourceType: "chat_message",
      sourceId: pedroChatMessage.id,
      actorUserId: pedro.user_id,
      courseId: pedroChatMessage.course_id || pedroReact.course_id,
      classId: pedroChatMessage.class_id || pedroReact.class_id,
      actionPath: "/professor/chat",
    });
  }

  return events;
}

async function ensureEvent(conn, event) {
  const deduplicationKey = `demo.student.journey:${event.type}:${event.sourceId}:${event.userId}`;
  let notification = await one(conn, `SELECT id FROM notifications WHERE deduplication_key = ? LIMIT 1`, [
    deduplicationKey,
  ]);
  let created = false;

  if (!notification) {
    const [result] = await conn.query(
      `INSERT INTO notifications
        (type, category, priority, title, message, source_type, source_id,
         actor_user_id, course_id, class_id, deduplication_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        event.type,
        event.category,
        event.priority,
        event.title,
        event.message,
        event.sourceType,
        event.sourceId,
        event.actorUserId,
        event.courseId,
        event.classId,
        deduplicationKey,
        event.createdAt,
      ]
    );
    notification = { id: result.insertId };
    created = true;
  }

  let recipient = await one(
    conn,
    `SELECT id FROM notification_recipients WHERE notification_id = ? AND user_id = ? LIMIT 1`,
    [notification.id, event.userId]
  );

  if (!recipient) {
    const [result] = await conn.query(
      `INSERT INTO notification_recipients
        (notification_id, user_id, action_path, read_at, archived_at, created_at)
       VALUES (?, ?, ?, NULL, NULL, ?)`,
      [notification.id, event.userId, event.actionPath, event.createdAt]
    );
    recipient = { id: result.insertId };
    created = true;
  }

  const delivery = await one(
    conn,
    `SELECT id FROM notification_deliveries WHERE recipient_id = ? AND channel = 'email' LIMIT 1`,
    [recipient.id]
  );

  if (!delivery) {
    await conn.query(
      `INSERT INTO notification_deliveries
        (recipient_id, channel, destination_snapshot, status, skip_reason, created_at, updated_at)
       VALUES (?, 'email', ?, 'skipped', 'demo_seed', ?, ?)`,
      [recipient.id, event.email, event.createdAt, event.createdAt]
    );
  }

  return created;
}

async function ensurePedroQuestion(conn, { pedro, junior, pedroReact }) {
  let conversation = await one(
    conn,
    `SELECT id FROM chat_conversations WHERE title = ? AND created_by_user_id = ? LIMIT 1`,
    [PEDRO_CHAT_TITLE, pedro.user_id]
  );

  if (!conversation) {
    const [result] = await conn.query(
      `INSERT INTO chat_conversations
        (type, channel_kind, title, category, course_id, class_id, created_by_user_id,
         initiator_role, assigned_user_id, status, created_at, updated_at)
       VALUES ('teacher_support', 'ticket', ?, 'activity', ?, ?, ?, 'student', ?, 'waiting_staff', ?, ?)`,
      [
        PEDRO_CHAT_TITLE,
        pedroReact.course_id,
        pedroReact.class_id,
        pedro.user_id,
        junior.user_id,
        "2026-09-22 16:40:00",
        "2026-09-22 16:40:00",
      ]
    );
    conversation = { id: result.insertId };
    await conn.query(
      `INSERT INTO chat_participants (conversation_id, user_id, participant_role, can_post, joined_at, created_at, updated_at)
       VALUES (?, ?, 'student', 1, ?, ?, ?), (?, ?, 'teacher', 1, ?, ?, ?)`,
      [
        conversation.id, pedro.user_id, "2026-09-22 16:40:00", "2026-09-22 16:40:00", "2026-09-22 16:40:00",
        conversation.id, junior.user_id, "2026-09-22 16:40:00", "2026-09-22 16:40:00", "2026-09-22 16:40:00",
      ]
    );
  }

  const existing = await loadChatFromStudent(conn, { title: PEDRO_CHAT_TITLE, senderEmail: pedro.email });
  if (existing) return existing;

  const [message] = await conn.query(
    `INSERT INTO chat_messages (conversation_id, sender_user_id, message_type, body, created_at)
     VALUES (?, ?, 'text', ?, ?)`,
    [conversation.id, pedro.user_id, PEDRO_CHAT_BODY, "2026-09-22 16:40:00"]
  );
  await conn.query(
    `UPDATE chat_conversations SET last_message_id = ?, last_message_at = ? WHERE id = ?`,
    [message.insertId, "2026-09-22 16:40:00", conversation.id]
  );

  return loadChatFromStudent(conn, { title: PEDRO_CHAT_TITLE, senderEmail: pedro.email });
}

async function seedSchema(conn, schemaName) {
  const marina = await loadStudent(conn, MARINA_EMAIL);
  const pedro = await loadStudent(conn, PEDRO_EMAIL);
  const actor = await one(conn, `SELECT id FROM users WHERE email = ? LIMIT 1`, [ACTOR_EMAIL]);

  const marinaEnrollments = await loadEnrollments(conn, marina.student_id);
  const pedroEnrollments = await loadEnrollments(conn, pedro.student_id);
  const marinaNode = await requireRow(marinaEnrollments[0], "matrícula da Marina");
  const pedroNode = await requireRow(
    pedroEnrollments.find((row) => row.course_id === marinaNode.course_id),
    "matrícula do Pedro no Node"
  );
  const pedroReact = await requireRow(
    pedroEnrollments.find((row) => row.course_id !== marinaNode.course_id),
    "matrícula do Pedro no React"
  );

  const nodeQuiz = await loadActivity(conn, { title: NODE_QUIZ_TITLE, courseId: marinaNode.course_id });
  const reactQuiz = await loadActivity(conn, { title: REACT_QUIZ_TITLE, courseId: pedroReact.course_id });
  const marinaGrade = await loadGrade(conn, { studentId: marina.student_id, title: NODE_EXAM_TITLE });
  const pedroNodeGrade = await loadGrade(conn, { studentId: pedro.student_id, title: NODE_EXAM_TITLE });
  const marinaContent = await requireRow(
    await loadInProgressContent(conn, { studentId: marina.student_id, courseId: marinaNode.course_id }),
    "conteúdo em andamento da Marina"
  );
  const pedroContent = await requireRow(
    (await loadInProgressContent(conn, { studentId: pedro.student_id, courseId: pedroReact.course_id })) ||
      (await loadInProgressContent(conn, { studentId: pedro.student_id, courseId: pedroNode.course_id })),
    "conteúdo em andamento do Pedro"
  );
  const nodeSession = await requireRow(await loadNextSession(conn, marinaNode.class_id), "próximo encontro da Turma B de Node");
  const absence = await requireRow(await loadAbsence(conn, pedro.student_id), "falta do Pedro");
  const overdue = await requireRow(
    await loadInvoice(conn, { studentId: pedro.student_id, status: "overdue" }),
    "mensalidade vencida do Pedro"
  );
  const marinaPayment = await loadApprovedPayment(conn, {
    studentId: marina.student_id,
    courseId: marinaNode.course_id,
  });
  const pedroPayment = await loadApprovedPayment(conn, {
    studentId: pedro.student_id,
    courseId: pedroNode.course_id,
  });
  const junior = await loadUser(conn, ACTOR_EMAIL);
  const larissa = await loadUser(conn, LARISSA_EMAIL);
  const marinaFirstGrade = await loadGrade(conn, { studentId: marina.student_id, title: NODE_FIRST_QUIZ });
  const pedroFirstGrade = await loadGrade(conn, { studentId: pedro.student_id, title: NODE_FIRST_QUIZ });
  const pedroReactGrade = await loadGrade(conn, { studentId: pedro.student_id, title: REACT_FIRST_QUIZ });
  const pedroReactExamGrade = await loadGrade(conn, { studentId: pedro.student_id, title: REACT_EXAM_TITLE });
  const marinaMiddlewareSubmission = await loadSubmission(conn, { studentId: marina.student_id, title: NODE_MIDDLEWARE });
  const marinaExamSubmission = await loadSubmission(conn, { studentId: marina.student_id, title: NODE_EXAM_TITLE });
  const pedroReactExamSubmission = await loadSubmission(conn, { studentId: pedro.student_id, title: REACT_EXAM_TITLE });
  const chatMessage = await loadChatFromStudent(conn, { title: CHAT_TITLE, senderEmail: MARINA_EMAIL });
  const pedroChatMessage = await ensurePedroQuestion(conn, { pedro, junior, pedroReact });
  const nodeFirstQuiz = await loadActivity(conn, { title: NODE_FIRST_QUIZ, courseId: marinaNode.course_id });
  const nodeMiddlewareActivity = await loadActivity(conn, { title: NODE_MIDDLEWARE, courseId: marinaNode.course_id });
  const nodeExam = await loadActivity(conn, { title: NODE_EXAM_TITLE, courseId: marinaNode.course_id });
  const reactFirstQuiz = await loadActivity(conn, { title: REACT_FIRST_QUIZ, courseId: pedroReact.course_id });
  const reactExam = await loadActivity(conn, { title: REACT_EXAM_TITLE, courseId: pedroReact.course_id });
  const marinaPaymentDetail = await loadPaymentDetail(conn, { studentId: marina.student_id, courseId: marinaNode.course_id });
  const pedroNodePayment = await loadPaymentDetail(conn, { studentId: pedro.student_id, courseId: pedroNode.course_id });
  const pedroReactPayment = await loadPaymentDetail(conn, { studentId: pedro.student_id, courseId: pedroReact.course_id });

  const events = buildEvents({
    marina,
    pedro,
    actorUserId: actor?.id || null,
    marinaNode,
    pedroNode,
    pedroReact,
    nodeQuiz,
    reactQuiz,
    marinaGrade,
    pedroNodeGrade,
    marinaContent,
    pedroContent,
    nodeSession,
    absence,
    overdue,
    marinaPayment,
    pedroPayment,
  }).concat(buildContinuedStory({
    marina,
    pedro,
    junior,
    larissa,
    actorUserId: actor?.id || junior.user_id,
    marinaNode,
    pedroNode,
    pedroReact,
    overdue,
    marinaFirstGrade,
    pedroFirstGrade,
    pedroReactGrade,
    pedroReactExamGrade,
    marinaMiddlewareSubmission,
    marinaExamSubmission,
    pedroReactExamSubmission,
    chatMessage,
    pedroChatMessage,
    marinaPaymentDetail,
    pedroNodePayment,
    pedroReactPayment,
    nodeFirstQuiz,
    nodeMiddlewareActivity,
    nodeExam,
    reactFirstQuiz,
    reactExam,
  })).sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.email.localeCompare(right.email));

  await conn.beginTransaction();
  try {
    await conn.query(
      `DELETE nd FROM notification_deliveries nd
       INNER JOIN notification_recipients nr ON nr.id = nd.recipient_id
       INNER JOIN notifications n ON n.id = nr.notification_id
       WHERE n.deduplication_key LIKE 'demo.student.journey:%'`
    );
    await conn.query(
      `DELETE nr FROM notification_recipients nr
       INNER JOIN notifications n ON n.id = nr.notification_id
       WHERE n.deduplication_key LIKE 'demo.student.journey:%'`
    );
    await conn.query(`DELETE FROM notifications WHERE deduplication_key LIKE 'demo.student.journey:%'`);

    let created = 0;
    for (const event of events) {
      if (await ensureEvent(conn, event)) created += 1;
    }

    await conn.query(
      `UPDATE notification_recipients nr
       INNER JOIN notifications n ON n.id = nr.notification_id
       INNER JOIN users u ON u.id = nr.user_id
       SET nr.archived_at = '2026-08-01 08:00:00'
       WHERE u.email = ?
         AND nr.archived_at IS NULL
         AND n.type IN ('admin.user.created', 'admin.enrollment.created')`,
      [LARISSA_EMAIL]
    );

    await conn.commit();

    const [counts] = await conn.query(
      `SELECT u.email, COUNT(nr.id) AS inbox
       FROM users u
       LEFT JOIN notification_recipients nr ON nr.user_id = u.id AND nr.archived_at IS NULL
       WHERE u.email IN (?, ?, ?, ?)
       GROUP BY u.email
       ORDER BY u.email`,
      [MARINA_EMAIL, PEDRO_EMAIL, ACTOR_EMAIL, LARISSA_EMAIL]
    );

    console.log(`${schemaName}: ${created} novas, ${events.length - created} já existiam.`);
    for (const row of counts) {
      console.log(`  ${row.email}: ${row.inbox} na caixa`);
    }
  } catch (error) {
    await conn.rollback();
    throw error;
  }
}

async function connect({ user, password, database }) {
  return mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user,
    password,
    database,
    multipleStatements: false,
  });
}

async function main() {
  const liveName = process.env.DB_NAME || "coursehub_escola";
  const snapshotName = process.env.DEMO_SNAPSHOT_DB || "coursehub_escola_jornada";

  const live = await connect({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: liveName,
  });

  try {
    await seedSchema(live, liveName);
  } finally {
    await live.end();
  }

  if (!process.env.MYSQL_ROOT_PASSWORD) {
    console.log(`Snapshot ${snapshotName} não foi alterado. Defina MYSQL_ROOT_PASSWORD para gravar a mesma jornada nele.`);
    return;
  }

  const snapshot = await connect({
    user: "root",
    password: process.env.MYSQL_ROOT_PASSWORD,
    database: snapshotName,
  });

  try {
    await seedSchema(snapshot, snapshotName);
  } finally {
    await snapshot.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
