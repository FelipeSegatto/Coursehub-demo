/**
 * Turma C de Node passa para o Marcelo.
 * Turma C de React, sem Marina e sem Pedro, passa para o Carlos.
 * A Turma A de React já é do Carlos e permanece com ele.
 *
 * Idempotente. Grava no banco ativo e, com MYSQL_ROOT_PASSWORD, no snapshot.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const mysql = require("mysql2/promise");

const MOVES = [
  {
    className: "Introdução ao Node.js e Express - Turma C 2026",
    teacherEmail: "marcelo.torres@email.com",
  },
  {
    className: "React do Zero - Turma C 2026",
    teacherEmail: "carlos.silva@email.com",
  },
];

async function one(conn, sql, params) {
  const [rows] = await conn.query(sql, params);
  return rows[0] || null;
}

async function seedSchema(conn, schemaName) {
  await conn.beginTransaction();
  try {
    for (const move of MOVES) {
      const classRow = await one(conn, "SELECT id, course_id FROM classes WHERE name = ? LIMIT 1", [move.className]);
      const teacher = await one(
        conn,
        `SELECT t.id FROM teachers t INNER JOIN users u ON u.id = t.user_id WHERE u.email = ? LIMIT 1`,
        [move.teacherEmail]
      );
      if (!classRow) throw new Error(`Turma não encontrada: ${move.className}`);
      if (!teacher) throw new Error(`Professor não encontrado: ${move.teacherEmail}`);

      await conn.query(
        `UPDATE classes SET teacher_id = ?, updated_at = NOW() WHERE id = ?`,
        [teacher.id, classRow.id]
      );
      await conn.query(
        `INSERT INTO course_teachers (course_id, teacher_id, status, created_at, updated_at)
         VALUES (?, ?, 'active', NOW(), NOW())
         ON DUPLICATE KEY UPDATE status = 'active', updated_at = NOW()`,
        [classRow.course_id, teacher.id]
      );
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  }

  const [rows] = await conn.query(
    `SELECT cl.name AS class_name, u.email
     FROM classes cl
     INNER JOIN teachers t ON t.id = cl.teacher_id
     INNER JOIN users u ON u.id = t.user_id
     WHERE cl.name IN (?, ?)
     ORDER BY cl.name`,
    MOVES.map((move) => move.className)
  );
  console.log(schemaName);
  for (const row of rows) console.log(`  ${row.class_name}: ${row.email}`);
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
    console.log(`Snapshot ${snapshotName} não foi alterado.`);
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
