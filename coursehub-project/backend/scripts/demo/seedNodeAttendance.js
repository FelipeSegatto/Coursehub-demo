/**
 * Tira o Framer Motion do Junior e entrega o vínculo para a Amanda,
 * que já ministra as turmas desse curso. Nas turmas de Node, cria o
 * semestre (encontros concluídos e futuros) e a chamada dos alunos
 * matriculados. A Turma B que já tem encontros só recebe chamada
 * que ainda falte.
 *
 * Idempotente. Grava no banco ativo e, com MYSQL_ROOT_PASSWORD,
 * também em DEMO_SNAPSHOT_DB.
 *
 * Uso (backend):
 *   node scripts/demo/seedNodeAttendance.js
 *   $env:MYSQL_ROOT_PASSWORD="..."; node scripts/demo/seedNodeAttendance.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const mysql = require("mysql2/promise");

const JUNIOR_EMAIL = "junior.galdino@email.com";
const AMANDA_EMAIL = "amanda.ribeiro@email.com";
const FRAMER_COURSE = "Introdução ao Framer Motion";
const NODE_COURSE = "Introdução ao Node.js e Express";

const SESSION_SPECS = [
  ["2026-08-20", "completed", "Encontro 1 — Node e o ambiente"],
  ["2026-08-27", "completed", "Encontro 2 — Express na prática"],
  ["2026-09-03", "completed", "Encontro 3 — Rotas e métodos HTTP"],
  ["2026-09-10", "completed", "Encontro 4 — Middlewares"],
  ["2026-09-17", "completed", "Encontro 5 — MySQL e o primeiro CRUD"],
  ["2026-09-24", "scheduled", "Encontro 6 — Autenticação na API"],
  ["2026-10-01", "scheduled", "Encontro 7 — Organização de pastas"],
  ["2026-10-08", "scheduled", "Encontro 8 — Início do projeto"],
  ["2026-10-15", "scheduled", "Encontro 9 — Revisão do CRUD"],
  ["2026-10-22", "scheduled", "Encontro 10 — Testes manuais da API"],
  ["2026-10-29", "scheduled", "Encontro 11 — Ajustes do projeto"],
  ["2026-11-05", "scheduled", "Encontro 12 — Entrega parcial"],
  ["2026-11-12", "scheduled", "Encontro 13 — Avaliação parcial"],
  ["2026-11-19", "scheduled", "Encontro 14 — Encerramento do semestre"],
];

async function one(conn, sql, params) {
  const [rows] = await conn.query(sql, params);
  return rows[0] || null;
}

async function requireRow(row, label) {
  if (!row) throw new Error(`A jornada demo não tem o dado esperado: ${label}.`);
  return row;
}

async function teacherIdByEmail(conn, email) {
  return requireRow(
    await one(
      conn,
      `SELECT t.id
       FROM teachers t
       INNER JOIN users u ON u.id = t.user_id
       WHERE u.email = ?
       LIMIT 1`,
      [email]
    ),
    email
  );
}

async function moveFramerMotion(conn) {
  const junior = await teacherIdByEmail(conn, JUNIOR_EMAIL);
  const amanda = await teacherIdByEmail(conn, AMANDA_EMAIL);
  const course = await requireRow(
    await one(conn, "SELECT id FROM courses WHERE name = ? LIMIT 1", [FRAMER_COURSE]),
    FRAMER_COURSE
  );

  await conn.query(
    `INSERT INTO course_teachers (course_id, teacher_id, status, created_at, updated_at)
     VALUES (?, ?, 'active', NOW(), NOW())
     ON DUPLICATE KEY UPDATE status = 'active', updated_at = NOW()`,
    [course.id, amanda.id]
  );

  const [removed] = await conn.query(
    `DELETE FROM course_teachers WHERE course_id = ? AND teacher_id = ?`,
    [course.id, junior.id]
  );

  return removed.affectedRows;
}

async function ensureSessions(conn, classRow) {
  const [existing] = await conn.query(
    `SELECT id, session_number, status FROM class_sessions WHERE class_id = ? ORDER BY session_number, id`,
    [classRow.id]
  );

  if (existing.length > 0) return existing;

  const created = [];
  for (const [index, spec] of SESSION_SPECS.entries()) {
    const [result] = await conn.query(
      `INSERT INTO class_sessions
        (class_id, session_number, title, session_date, start_time, end_time, session_type, description, status)
       VALUES (?, ?, ?, ?, '19:00:00', '21:00:00', 'class', ?, ?)`,
      [classRow.id, index + 1, spec[2], spec[0], `Semestre 2026.2 de ${NODE_COURSE}`, spec[1]]
    );
    created.push({ id: result.insertId, session_number: index + 1, status: spec[1] });
  }

  return created;
}

async function ensureAttendance(conn, classRow, sessions) {
  const [students] = await conn.query(
    `SELECT student_id
     FROM enrollments
     WHERE class_id = ? AND status = 'active'
     ORDER BY student_id`,
    [classRow.id]
  );

  const completed = sessions.filter((session) => session.status === "completed");
  let created = 0;

  for (const session of completed) {
    for (const [index, student] of students.entries()) {
      const absent = index === 2 && Number(session.session_number) === 3;
      const [result] = await conn.query(
        `INSERT INTO attendance (class_session_id, student_id, status, created_at, updated_at)
         SELECT ?, ?, ?, NOW(), NOW()
         FROM DUAL
         WHERE NOT EXISTS (
           SELECT 1 FROM attendance
           WHERE class_session_id = ? AND student_id = ?
         )`,
        [session.id, student.student_id, absent ? "absent" : "present", session.id, student.student_id]
      );
      created += result.affectedRows;
    }
  }

  return { students: students.length, created };
}

async function seedSchema(conn, schemaName) {
  await conn.beginTransaction();
  let removed = 0;
  const classReports = [];

  try {
    removed = await moveFramerMotion(conn);

    const [classes] = await conn.query(
      `SELECT cl.id, cl.name
       FROM classes cl
       INNER JOIN courses c ON c.id = cl.course_id
       WHERE c.name = ? AND cl.status = 'active'
       ORDER BY cl.id`,
      [NODE_COURSE]
    );

    for (const classRow of classes) {
      const sessions = await ensureSessions(conn, classRow);
      const attendance = await ensureAttendance(conn, classRow, sessions);
      classReports.push({
        name: classRow.name,
        sessions: sessions.length,
        ...attendance,
      });
    }

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  }

  const [juniorCourses] = await conn.query(
    `SELECT c.name
     FROM course_teachers ct
     INNER JOIN teachers t ON t.id = ct.teacher_id
     INNER JOIN users u ON u.id = t.user_id
     INNER JOIN courses c ON c.id = ct.course_id
     WHERE u.email = ? AND ct.status = 'active'
     ORDER BY c.name`,
    [JUNIOR_EMAIL]
  );

  const [chart] = await conn.query(
    `SELECT cl.name,
            SUM(CASE WHEN att.status = 'present' THEN 1 ELSE 0 END) AS present_count,
            COUNT(att.id) AS total_count
     FROM classes cl
     INNER JOIN courses c ON c.id = cl.course_id
     LEFT JOIN class_sessions cs ON cs.class_id = cl.id
     LEFT JOIN attendance att ON att.class_session_id = cs.id
     WHERE c.name = ?
     GROUP BY cl.id, cl.name
     ORDER BY cl.name`,
    [NODE_COURSE]
  );

  console.log(`${schemaName}: vínculo do Framer Motion removido do Junior (${removed}).`);
  console.log(`  Junior: ${juniorCourses.map((row) => row.name).join(", ")}`);
  for (const row of classReports) {
    console.log(`  ${row.name}: ${row.sessions} encontros, ${row.students} alunos, ${row.created} chamadas novas`);
  }
  for (const row of chart) {
    const total = Number(row.total_count || 0);
    const label = total === 0 ? "sem chamada" : `${Math.round((Number(row.present_count) / total) * 100)}%`;
    console.log(`  frequência ${row.name}: ${label}`);
  }
}

async function connect({ user, password, database }) {
  return mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user,
    password,
    database,
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
    console.log(`Snapshot ${snapshotName} não foi alterado. Defina MYSQL_ROOT_PASSWORD para gravar o mesmo recorte nele.`);
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
