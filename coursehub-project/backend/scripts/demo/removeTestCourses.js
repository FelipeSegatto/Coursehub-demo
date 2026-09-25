/**
 * Remove cursos criados pela suíte de testes (nome começando com "TEST ")
 * e os alunos que só existem por causa desses cursos.
 *
 * Idempotente. Grava no banco ativo (DB_NAME). Com MYSQL_ROOT_PASSWORD,
 * grava também em DEMO_SNAPSHOT_DB.
 *
 * Uso (backend):
 *   node scripts/demo/removeTestCourses.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const mysql = require("mysql2/promise");

async function removeSchema(conn, schemaName) {
  const [courses] = await conn.query(
    `SELECT id, name, status FROM courses WHERE name LIKE 'TEST %' ORDER BY id`
  );

  if (courses.length === 0) {
    console.log(`${schemaName}: nenhum curso de teste`);
    return;
  }

  const courseIds = courses.map((course) => course.id);
  const [enrollments] = await conn.query(
    `SELECT id, student_id FROM enrollments WHERE course_id IN (?)`,
    [courseIds]
  );
  const enrollmentIds = enrollments.map((row) => row.id);
  const studentIds = [...new Set(enrollments.map((row) => row.student_id))];

  let exclusiveStudents = [];
  if (studentIds.length > 0) {
    const [rows] = await conn.query(
      `SELECT s.id, s.user_id, u.email
       FROM students s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.id IN (?)
         AND NOT EXISTS (
           SELECT 1 FROM enrollments e
           WHERE e.student_id = s.id AND e.course_id NOT IN (?)
         )`,
      [studentIds, courseIds]
    );
    exclusiveStudents = rows;
  }

  const contractSql = enrollmentIds.length
    ? `SELECT id FROM financial_contracts WHERE course_id IN (?) OR enrollment_id IN (?)`
    : `SELECT id FROM financial_contracts WHERE course_id IN (?)`;
  const contractParams = enrollmentIds.length ? [courseIds, enrollmentIds] : [courseIds];
  const [contracts] = await conn.query(contractSql, contractParams);
  const contractIds = contracts.map((row) => row.id);

  await conn.beginTransaction();

  try {
    if (contractIds.length > 0) {
      await conn.query(
        `DELETE pe FROM payment_events pe
         INNER JOIN payments p ON p.id = pe.payment_id
         INNER JOIN invoices i ON i.id = p.invoice_id
         WHERE i.financial_contract_id IN (?)`,
        [contractIds]
      );
      await conn.query(
        `DELETE p FROM payments p
         INNER JOIN invoices i ON i.id = p.invoice_id
         WHERE i.financial_contract_id IN (?)`,
        [contractIds]
      );
      await conn.query(
        `DELETE ica FROM invoice_collection_actions ica
         INNER JOIN invoices i ON i.id = ica.invoice_id
         WHERE i.financial_contract_id IN (?)`,
        [contractIds]
      );
      await conn.query(
        `DELETE t FROM invoice_payment_access_tokens t
         INNER JOIN invoices i ON i.id = t.invoice_id
         WHERE i.financial_contract_id IN (?)`,
        [contractIds]
      );
      await conn.query(
        `DELETE s FROM invoice_payment_sessions s
         INNER JOIN invoices i ON i.id = s.invoice_id
         WHERE i.financial_contract_id IN (?)`,
        [contractIds]
      );
      await conn.query(
        `DELETE FROM financial_events WHERE financial_contract_id IN (?) OR invoice_id IN (SELECT id FROM invoices WHERE financial_contract_id IN (?))`,
        [contractIds, contractIds]
      );
      await conn.query(
        `UPDATE financial_contracts SET activation_invoice_id = NULL WHERE id IN (?)`,
        [contractIds]
      );
      await conn.query(`DELETE FROM contract_acceptances WHERE financial_contract_id IN (?)`, [contractIds]);
      await conn.query(`DELETE FROM contract_terms_documents WHERE financial_contract_id IN (?)`, [contractIds]);
      await conn.query(`DELETE FROM invoices WHERE financial_contract_id IN (?)`, [contractIds]);
    }

    if (enrollmentIds.length > 0) {
      await conn.query(`DELETE FROM financial_events WHERE enrollment_id IN (?)`, [enrollmentIds]);
    }

    await conn.query(`DELETE FROM public_checkout_sessions WHERE course_id IN (?)`, [courseIds]);

    if (contractIds.length > 0) {
      await conn.query(
        `UPDATE financial_contracts SET enrollment_id = NULL WHERE id IN (?)`,
        [contractIds]
      );
      await conn.query(`DELETE FROM financial_contracts WHERE id IN (?)`, [contractIds]);
    }

    await conn.query(`DELETE FROM completion_rules WHERE course_id IN (?)`, [courseIds]);
    await conn.query(`DELETE FROM course_pricing_plans WHERE course_id IN (?)`, [courseIds]);
    await conn.query(`DELETE FROM course_teachers WHERE course_id IN (?)`, [courseIds]);
    await conn.query(`DELETE FROM enrollments WHERE course_id IN (?)`, [courseIds]);
    await conn.query(`DELETE FROM courses WHERE id IN (?)`, [courseIds]);

    for (const student of exclusiveStudents) {
      await conn.query(
        `DELETE nd FROM notification_deliveries nd
         INNER JOIN notification_recipients nr ON nr.id = nd.recipient_id
         WHERE nr.user_id = ?`,
        [student.user_id]
      );
      await conn.query(`DELETE FROM notification_recipients WHERE user_id = ?`, [student.user_id]);
      await conn.query(`DELETE FROM student_contracting_parties WHERE student_id = ?`, [student.id]);
      await conn.query(`DELETE FROM contracting_parties WHERE user_id = ?`, [student.user_id]);
      await conn.query(`DELETE FROM account_activation_tokens WHERE user_id = ?`, [student.user_id]);
      await conn.query(`DELETE FROM students WHERE id = ?`, [student.id]);
      await conn.query(`DELETE FROM users WHERE id = ?`, [student.user_id]);
    }

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  }

  const [left] = await conn.query(`SELECT COUNT(*) AS total FROM courses WHERE name LIKE 'TEST %'`);
  console.log(
    `${schemaName}: removidos ${courses.map((course) => course.name).join("; ")} | alunos exclusivos ${exclusiveStudents.length} | restam ${left[0].total}`
  );
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
    await removeSchema(live, liveName);
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
    await removeSchema(snapshot, snapshotName);
  } finally {
    await snapshot.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
