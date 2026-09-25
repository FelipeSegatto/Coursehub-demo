/**
 * Regra de conclusão igual para todo curso ativo: 75% de conteúdo,
 * 75% de frequência e nota 7. Itens obrigatórios entram na regra.
 *
 * No React do Pedro, só faltam a atividade e a avaliação da demo.
 * Conteúdo e frequência já passam de 75%, e a média das notas já
 * publicadas fica acima de 7. A elegibilidade vira verdadeira quando
 * o Junior corrigir esses dois envios.
 *
 * Idempotente. Grava no banco ativo. O snapshot é outra etapa
 * (npm run demo:snapshot).
 */
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const db = require("../../db");
const { createRuleVersion } = require("../../services/academic/completionRuleService");
const { evaluateEnrollmentCompletion } = require("../../services/academic/enrollmentCompletionService");

const PEDRO_EMAIL = "pedro.nogueira@email.com";
const REACT_COURSE = "React do Zero";
const DEMO_ACTIVITY = "Atividade Final: o que o useState devolve";
const DEMO_ACTIVITY_OLD = "Quiz rápido: o que o useState devolve";
const DEMO_EXAM = "Avaliação final — React na prática";
const TARGET = {
  progress: 75,
  attendance: 75,
  grade: 7,
};

const CONTENT_TO_COMPLETE = [
  "Apostila: Fundamentos de React",
  "React Router na prática",
  "React com projeto prático",
  "Sistema de login com React",
  "React para iniciantes com projeto",
  "Apostila React",
];

async function applyRules(conn) {
  const [courses] = await conn.query(
    `SELECT id, name FROM courses WHERE status = 'active' ORDER BY id`
  );
  const [adminRows] = await conn.query(
    `SELECT id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY id LIMIT 1`
  );
  const adminId = adminRows[0]?.id || null;
  let created = 0;

  for (const course of courses) {
    const [activeRows] = await conn.query(
      `SELECT min_content_progress_percentage AS progress,
              min_attendance_percentage AS attendance,
              min_average_grade AS grade,
              require_all_mandatory_items AS mandatory
       FROM completion_rules
       WHERE course_id = ? AND status = 'active'
       ORDER BY id DESC LIMIT 1`,
      [course.id]
    );
    const active = activeRows[0];
    const already =
      active &&
      Number(active.progress) === TARGET.progress &&
      Number(active.attendance) === TARGET.attendance &&
      Number(active.grade) === TARGET.grade &&
      Number(active.mandatory) === 1;

    if (already) continue;

    await createRuleVersion(db, {
      courseId: course.id,
      minContentProgressPercentage: TARGET.progress,
      minAttendancePercentage: TARGET.attendance,
      minAverageGrade: TARGET.grade,
      requireAllMandatoryItems: true,
      createdByUserId: adminId,
    });
    created += 1;
  }

  return { courses: courses.length, created };
}

async function loadPedroReact(conn) {
  const [rows] = await conn.query(
    `SELECT s.id AS student_id, e.id AS enrollment_id, e.class_id, c.id AS course_id
     FROM users u
     INNER JOIN students s ON s.user_id = u.id
     INNER JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
     INNER JOIN courses c ON c.id = e.course_id
     WHERE u.email = ? AND c.name = ?
     LIMIT 1`,
    [PEDRO_EMAIL, REACT_COURSE]
  );

  if (!rows[0]) {
    throw new Error("Matrícula ativa do Pedro em React do Zero não encontrada.");
  }

  return rows[0];
}

async function completeContents(conn, pedro) {
  const [contents] = await conn.query(
    `SELECT id, title FROM course_contents
     WHERE course_id = ? AND status = 'active' AND title IN (?)`,
    [pedro.course_id, CONTENT_TO_COMPLETE]
  );

  for (const content of contents) {
    await conn.query(
      `INSERT INTO student_content_progress
        (student_id, course_id, content_id, status, progress_percentage, last_position_seconds,
         started_at, completed_at, last_accessed_at, created_at, updated_at)
       VALUES (?, ?, ?, 'completed', 100, 0, '2026-09-10 10:00:00', '2026-09-18 10:00:00', '2026-09-18 10:00:00', '2026-09-10 10:00:00', '2026-09-18 10:00:00')
       ON DUPLICATE KEY UPDATE
         status = 'completed',
         progress_percentage = 100,
         completed_at = COALESCE(completed_at, '2026-09-18 10:00:00'),
         updated_at = '2026-09-18 10:00:00'`,
      [pedro.student_id, pedro.course_id, content.id]
    );
  }

  return contents.length;
}

async function ensureAttendance(conn, pedro) {
  const [sessions] = await conn.query(
    `SELECT id, session_number, status, DATE_FORMAT(session_date, '%Y-%m-%d') AS session_date
     FROM class_sessions
     WHERE class_id = ? AND status NOT IN ('cancelled', 'archived')
       AND session_date <= '2026-09-25'
     ORDER BY session_date, id`,
    [pedro.class_id]
  );

  const past = sessions;
  const target = past.length >= 4 ? past : [];

  if (target.length === 0) {
    const [maxRows] = await conn.query(
      `SELECT COALESCE(MAX(session_number), 0) AS maxNumber FROM class_sessions WHERE class_id = ?`,
      [pedro.class_id]
    );
    const maxNumber = Number(maxRows[0].maxNumber);
    const dates = ["2026-08-06", "2026-08-13", "2026-08-20", "2026-08-27", "2026-09-03", "2026-09-10", "2026-09-17", "2026-09-24"];

    for (const [index, date] of dates.entries()) {
      const [result] = await conn.query(
        `INSERT INTO class_sessions
          (class_id, session_number, title, session_date, start_time, end_time, session_type, description, status)
         VALUES (?, ?, ?, ?, '19:00:00', '21:00:00', 'class', 'Semestre 2026.2 de React do Zero', 'completed')`,
        [pedro.class_id, maxNumber + index + 1, `Encontro ${maxNumber + index + 1}`, date]
      );
      target.push({ id: result.insertId });
    }
  }

  let written = 0;
  for (const [index, session] of target.entries()) {
    const status = index === 2 ? "absent" : "present";
    const [result] = await conn.query(
      `INSERT INTO attendance (class_session_id, student_id, status, created_at, updated_at)
       SELECT ?, ?, ?, '2026-09-18 21:10:00', '2026-09-18 21:10:00'
       FROM DUAL
       WHERE NOT EXISTS (
         SELECT 1 FROM attendance WHERE class_session_id = ? AND student_id = ?
       )`,
      [session.id, pedro.student_id, status, session.id, pedro.student_id]
    );
    written += result.affectedRows;
  }

  return { sessions: target.length, written };
}

async function focusRequiredItems(conn, pedro) {
  const [activities] = await conn.query(
    `SELECT a.id, a.title, a.activity_kind, sub.status AS submission_status
     FROM activities a
     LEFT JOIN submissions sub ON sub.activity_id = a.id AND sub.student_id = ?
     WHERE a.course_id = ? AND a.status = 'active'`,
    [pedro.student_id, pedro.course_id]
  );

  const keep = new Set();
  for (const activity of activities) {
    const isDemo =
      activity.title === DEMO_ACTIVITY ||
      activity.title === DEMO_ACTIVITY_OLD ||
      activity.title === DEMO_EXAM;
    const alreadyGraded = activity.submission_status === "graded";
    if (isDemo || alreadyGraded) keep.add(activity.id);
  }

  const demoActivity = activities.find(
    (activity) => activity.title === DEMO_ACTIVITY || activity.title === DEMO_ACTIVITY_OLD
  );
  const demoExam = activities.find(
    (activity) => activity.title === DEMO_EXAM && activity.activity_kind === "exam"
  );

  if (!demoActivity) {
    throw new Error(`A atividade da demo "${DEMO_ACTIVITY}" não foi encontrada.`);
  }
  if (!demoExam) {
    throw new Error(`A avaliação da demo "${DEMO_EXAM}" não foi encontrada.`);
  }

  const dropIds = activities.filter((activity) => !keep.has(activity.id)).map((activity) => activity.id);
  if (dropIds.length > 0) {
    await conn.query(
      `UPDATE activities SET is_required = 0, updated_at = updated_at WHERE id IN (?)`,
      [dropIds]
    );
  }
  await conn.query(
    `UPDATE activities SET is_required = 1, updated_at = updated_at WHERE id IN (?)`,
    [[...keep]]
  );

  return { required: keep.size, optional: dropIds.length };
}

async function renameDemoActivity(conn) {
  const [result] = await conn.query(
    `UPDATE activities SET title = ? WHERE title = ?`,
    [DEMO_ACTIVITY, DEMO_ACTIVITY_OLD]
  );
  return result.affectedRows;
}

async function applyDemoBaseline() {
  const conn = db.promise();
  const renamed = await renameDemoActivity(conn);
  const rules = await applyRules(conn);
  const pedro = await loadPedroReact(conn);
  const contents = await completeContents(conn, pedro);
  const attendance = await ensureAttendance(conn, pedro);
  const required = await focusRequiredItems(conn, pedro);
  const evaluation = await evaluateEnrollmentCompletion(db, pedro.enrollment_id);

  return {
    renamed,
    rules,
    contents,
    attendance,
    required,
    eligibleNow: evaluation.eligible,
    requirements: evaluation.requirements,
  };
}

async function main() {
  console.log(JSON.stringify(await applyDemoBaseline(), null, 2));
  process.exit(0);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

module.exports = { applyDemoBaseline };
