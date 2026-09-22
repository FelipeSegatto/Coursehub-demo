/**
 * Notificações que ilustram a jornada da Marina e do Pedro.
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
const NODE_QUIZ_TITLE = "Quiz rápido: req, res e a primeira rota";
const REACT_QUIZ_TITLE = "Quiz rápido: o que o useState devolve";
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

  if (marinaContent) {
    events.push({
      userId: marina.user_id,
      email: marina.email,
      createdAt: "2026-09-14 10:00:00",
      type: "learning.content.published",
      category: "learning",
      priority: "normal",
      title: `Novo conteúdo: ${marinaContent.title}`,
      message: `Um novo ${contentLabel(marinaContent.type)} foi publicado no curso ${marinaContent.course_name}: "${marinaContent.title}".`,
      sourceType: "course_content",
      sourceId: marinaContent.id,
      actorUserId,
      courseId: marinaContent.course_id,
      classId: marinaNode.class_id,
      actionPath: `/aluno/dashboard-aluno/courses/${marinaContent.course_id}`,
    });
  }

  if (pedroContent) {
    events.push({
      userId: pedro.user_id,
      email: pedro.email,
      createdAt: "2026-09-14 10:05:00",
      type: "learning.content.published",
      category: "learning",
      priority: "normal",
      title: `Novo conteúdo: ${pedroContent.title}`,
      message: `Um novo ${contentLabel(pedroContent.type)} foi publicado no curso ${pedroContent.course_name}: "${pedroContent.title}".`,
      sourceType: "course_content",
      sourceId: pedroContent.id,
      actorUserId,
      courseId: pedroContent.course_id,
      classId: pedroContent.course_id === pedroReact.course_id ? pedroReact.class_id : pedroNode.class_id,
      actionPath: `/aluno/dashboard-aluno/courses/${pedroContent.course_id}`,
    });
  }

  if (nodeSession) {
    const timeLabel = nodeSession.start_time ? ` às ${String(nodeSession.start_time).slice(0, 5)}` : "";
    events.push({
      userId: marina.user_id,
      email: marina.email,
      createdAt: "2026-09-16 18:30:00",
      type: "learning.session.scheduled",
      category: "learning",
      priority: "normal",
      title: `Novo encontro: ${nodeSession.title}`,
      message: `Um novo encontro foi agendado para a turma ${nodeSession.class_name} do curso ${nodeSession.course_name}: "${nodeSession.title}", em ${formatDateOnly(nodeSession.session_date)}${timeLabel}.`,
      sourceType: "class_session",
      sourceId: nodeSession.id,
      actorUserId,
      courseId: nodeSession.course_id,
      classId: nodeSession.class_id,
      actionPath: "/aluno/calendario",
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

  const quizMessage = (activity) => {
    const due = activity.due_date ? ` Prazo: ${formatDateOnly(activity.due_date)}.` : "";
    return `Uma nova atividade foi publicada no curso ${activity.course_name}: "${activity.title}".${due}`;
  };

  events.push({
    userId: marina.user_id,
    email: marina.email,
    createdAt: "2026-09-21 09:00:00",
    type: "learning.activity.published",
    category: "learning",
    priority: "normal",
    title: `Nova atividade: ${nodeQuiz.title}`,
    message: quizMessage(nodeQuiz),
    sourceType: "activity",
    sourceId: nodeQuiz.id,
    actorUserId,
    courseId: nodeQuiz.course_id,
    classId: marinaNode.class_id,
    actionPath: activityPath(nodeQuiz),
  });

  events.push({
    userId: pedro.user_id,
    email: pedro.email,
    createdAt: "2026-09-21 09:00:00",
    type: "learning.activity.published",
    category: "learning",
    priority: "normal",
    title: `Nova atividade: ${nodeQuiz.title}`,
    message: quizMessage(nodeQuiz),
    sourceType: "activity",
    sourceId: nodeQuiz.id,
    actorUserId,
    courseId: nodeQuiz.course_id,
    classId: pedroNode.class_id,
    actionPath: activityPath(nodeQuiz),
  });

  events.push({
    userId: pedro.user_id,
    email: pedro.email,
    createdAt: "2026-09-21 09:10:00",
    type: "learning.activity.published",
    category: "learning",
    priority: "normal",
    title: `Nova atividade: ${reactQuiz.title}`,
    message: quizMessage(reactQuiz),
    sourceType: "activity",
    sourceId: reactQuiz.id,
    actorUserId,
    courseId: reactQuiz.course_id,
    classId: pedroReact.class_id,
    actionPath: activityPath(reactQuiz),
  });

  events.push({
    userId: pedro.user_id,
    email: pedro.email,
    createdAt: "2026-09-21 09:20:00",
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
  });

  await conn.beginTransaction();
  try {
    let created = 0;
    for (const event of events) {
      if (await ensureEvent(conn, event)) created += 1;
    }
    await conn.commit();

    const [counts] = await conn.query(
      `SELECT u.email, COUNT(nr.id) AS inbox
       FROM users u
       LEFT JOIN notification_recipients nr ON nr.user_id = u.id AND nr.archived_at IS NULL
       WHERE u.email IN (?, ?)
       GROUP BY u.email
       ORDER BY u.email`,
      [MARINA_EMAIL, PEDRO_EMAIL]
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
