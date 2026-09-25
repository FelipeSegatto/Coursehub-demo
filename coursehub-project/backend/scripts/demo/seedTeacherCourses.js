/**
 * Garante um curso ativo para cada professor que ainda não tem vínculo
 * e troca o DDD do telefone para 11. Os cursos do Junior não mudam.
 *
 * Idempotente. Grava no banco ativo (DB_NAME). Com MYSQL_ROOT_PASSWORD,
 * grava também em DEMO_SNAPSHOT_DB, que é o que o logout restaura.
 *
 * Uso (backend):
 *   node scripts/demo/seedTeacherCourses.js
 *   $env:MYSQL_ROOT_PASSWORD="..."; node scripts/demo/seedTeacherCourses.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const mysql = require("mysql2/promise");

const JUNIOR_EMAIL = "junior.galdino@email.com";

function withAreaCode11(phone) {
  const value = String(phone || "").trim();
  if (!value) return value;

  const formatted = value.match(/^\((\d{2})\)(.*)$/);
  if (formatted) return `(11)${formatted[2]}`;

  const digits = value.replace(/\D/g, "");
  if (digits.length >= 10) return `11${digits.slice(2)}`;

  return value;
}

async function seedSchema(conn, schemaName) {
  const [courses] = await conn.query(
    `SELECT id, name FROM courses WHERE status = 'active' ORDER BY id`
  );

  if (courses.length === 0) {
    throw new Error("Não há curso ativo para vincular os professores.");
  }

  const [teachers] = await conn.query(
    `SELECT t.id, t.phone, u.email, u.name,
            (
              SELECT COUNT(*)
              FROM course_teachers ct
              WHERE ct.teacher_id = t.id AND ct.status = 'active'
            ) AS active_courses
     FROM teachers t
     INNER JOIN users u ON u.id = t.user_id
     ORDER BY t.id`
  );

  const unassigned = teachers.filter(
    (teacher) => teacher.email !== JUNIOR_EMAIL && Number(teacher.active_courses) === 0
  );

  let phones = 0;

  await conn.beginTransaction();
  try {
    for (const teacher of teachers) {
      const nextPhone = withAreaCode11(teacher.phone);
      if (nextPhone === teacher.phone) continue;

      await conn.query(
        `UPDATE teachers SET phone = ?, updated_at = NOW() WHERE id = ?`,
        [nextPhone, teacher.id]
      );
      phones += 1;
    }

    for (const [index, teacher] of unassigned.entries()) {
      const course = courses[index % courses.length];
      await conn.query(
        `INSERT INTO course_teachers (course_id, teacher_id, status, created_at, updated_at)
         VALUES (?, ?, 'active', NOW(), NOW())
         ON DUPLICATE KEY UPDATE status = 'active', updated_at = NOW()`,
        [course.id, teacher.id]
      );
    }

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  }

  const [summary] = await conn.query(
    `SELECT
       SUM(CASE WHEN active_courses = 0 THEN 1 ELSE 0 END) AS without_course,
       SUM(CASE WHEN phone LIKE '(11)%' OR phone LIKE '11%' THEN 1 ELSE 0 END) AS ddd_11
     FROM (
       SELECT t.phone,
              (
                SELECT COUNT(*)
                FROM course_teachers ct
                WHERE ct.teacher_id = t.id AND ct.status = 'active'
              ) AS active_courses
       FROM teachers t
     ) counts`
  );

  const [junior] = await conn.query(
    `SELECT c.name
     FROM course_teachers ct
     INNER JOIN teachers t ON t.id = ct.teacher_id
     INNER JOIN users u ON u.id = t.user_id
     INNER JOIN courses c ON c.id = ct.course_id
     WHERE u.email = ? AND ct.status = 'active'
     ORDER BY c.name`,
    [JUNIOR_EMAIL]
  );

  console.log(
    `${schemaName}: ${unassigned.length} professores ganharam curso, ${phones} telefones foram para o DDD 11.`
  );
  console.log(
    `  sem curso: ${summary[0].without_course} | telefones 11: ${summary[0].ddd_11}/${teachers.length}`
  );
  console.log(`  Junior: ${junior.map((row) => row.name).join(", ")}`);
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
