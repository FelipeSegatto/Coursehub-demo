/**
 * Alinha o professor da demo com o painel de quatro papéis:
 * Junior entra com a senha da demo, é titular das Turmas B de Node e React
 * (Marina e Pedro) e recebe o chat da aluna. As Turmas C continuam com ele.
 *
 * Idempotente. Grava no banco ativo (DB_NAME). Com MYSQL_ROOT_PASSWORD,
 * grava também em DEMO_SNAPSHOT_DB, que é o que o logout restaura.
 *
 * Uso (backend):
 *   node scripts/demo/seedTeacherPanel.js
 *   $env:MYSQL_ROOT_PASSWORD="..."; node scripts/demo/seedTeacherPanel.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");

const DEMO_PASSWORD = "CourseHub.Demo.2026";
const JUNIOR_EMAIL = "junior.galdino@email.com";
const MARINA_EMAIL = "marina.alves@email.com";
const CHAT_TITLE = "Dúvida sobre middleware";
const CLASS_TARGETS = [
  { courseName: "Introdução ao Node.js e Express", className: "Introdução ao Node.js e Express — Turma B 2026" },
  { courseName: "React do Zero", className: "React do Zero — Turma B 2026" },
];

async function one(conn, sql, params) {
  const [rows] = await conn.query(sql, params);
  return rows[0] || null;
}

async function requireRow(row, label) {
  if (!row) throw new Error(`A jornada demo não tem o dado esperado: ${label}.`);
  return row;
}

async function alignSchema(conn, schemaName) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const junior = await requireRow(
    await one(
      conn,
      `SELECT u.id AS user_id, t.id AS teacher_id
       FROM users u
       INNER JOIN teachers t ON t.user_id = u.id
       WHERE u.email = ?
       LIMIT 1`,
      [JUNIOR_EMAIL]
    ),
    JUNIOR_EMAIL
  );

  const classes = [];
  for (const target of CLASS_TARGETS) {
    classes.push(
      await requireRow(
        await one(
          conn,
          `SELECT cl.id, cl.course_id, cl.name AS class_name, c.name AS course_name
           FROM classes cl
           INNER JOIN courses c ON c.id = cl.course_id
           WHERE c.name = ? AND cl.name = ?
           LIMIT 1`,
          [target.courseName, target.className]
        ),
        `${target.className} de ${target.courseName}`
      )
    );
  }

  const marina = await requireRow(
    await one(conn, "SELECT id FROM users WHERE email = ? LIMIT 1", [MARINA_EMAIL]),
    MARINA_EMAIL
  );

  const chat = await requireRow(
    await one(
      conn,
      `SELECT id FROM chat_conversations
       WHERE created_by_user_id = ? AND title = ?
       LIMIT 1`,
      [marina.id, CHAT_TITLE]
    ),
    CHAT_TITLE
  );

  const nodeClass = classes[0];

  await conn.beginTransaction();
  try {
    await conn.query(
      `UPDATE users
       SET password_hash = ?, status = 'active', updated_at = NOW()
       WHERE id = ?`,
      [passwordHash, junior.user_id]
    );

    await conn.query(
      `UPDATE classes SET teacher_id = ?, updated_at = NOW() WHERE id IN (?)`,
      [junior.teacher_id, classes.map((row) => row.id)]
    );

    for (const row of classes) {
      await conn.query(
        `INSERT INTO course_teachers (course_id, teacher_id, status, created_at, updated_at)
         VALUES (?, ?, 'active', NOW(), NOW())
         ON DUPLICATE KEY UPDATE status = 'active', updated_at = NOW()`,
        [row.course_id, junior.teacher_id]
      );
    }

    await conn.query(
      `UPDATE chat_conversations
       SET assigned_user_id = ?, class_id = ?, updated_at = NOW()
       WHERE id = ?`,
      [junior.user_id, nodeClass.id, chat.id]
    );

    const [teacherParticipants] = await conn.query(
      `SELECT id, user_id FROM chat_participants
       WHERE conversation_id = ? AND participant_role = 'teacher'`,
      [chat.id]
    );

    if (teacherParticipants.length === 0) {
      await conn.query(
        `INSERT INTO chat_participants
          (conversation_id, user_id, participant_role, can_post, joined_at, created_at, updated_at)
         VALUES (?, ?, 'teacher', 1, NOW(), NOW(), NOW())`,
        [chat.id, junior.user_id]
      );
    } else {
      await conn.query(
        `UPDATE chat_participants
         SET user_id = ?, updated_at = NOW()
         WHERE conversation_id = ? AND participant_role = 'teacher'`,
        [junior.user_id, chat.id]
      );
    }

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  }

  const [owned] = await conn.query(
    `SELECT c.name AS course_name, cl.name AS class_name
     FROM classes cl
     INNER JOIN courses c ON c.id = cl.course_id
     WHERE cl.teacher_id = ?
     ORDER BY c.name, cl.name`,
    [junior.teacher_id]
  );
  const assigned = await one(
    conn,
    `SELECT staff.email AS assigned_email
     FROM chat_conversations conv
     INNER JOIN users staff ON staff.id = conv.assigned_user_id
     WHERE conv.id = ?`,
    [chat.id]
  );
  const passwordOk = await bcrypt.compare(
    DEMO_PASSWORD,
    (await one(conn, "SELECT password_hash FROM users WHERE id = ?", [junior.user_id])).password_hash
  );

  console.log(`${schemaName}: Junior alinhado ao painel.`);
  console.log(`  senha demo: ${passwordOk ? "ok" : "falhou"}`);
  console.log(`  chat: ${assigned.assigned_email}`);
  for (const row of owned) {
    console.log(`  turma: ${row.course_name} / ${row.class_name}`);
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
    await alignSchema(live, liveName);
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
    await alignSchema(snapshot, snapshotName);
  } finally {
    await snapshot.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
