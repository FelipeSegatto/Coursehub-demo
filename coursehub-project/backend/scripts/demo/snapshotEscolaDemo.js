/**
 * Cópia completa de coursehub_escola ↔ coursehub_escola_jornada.
 *
 * O app continua apontando para coursehub_escola. Esta cópia é o
 * ponto de restauração da jornada (depois do Pix, envios, chamadas).
 *
 * Snapshot (escola → jornada):
 *   $env:MYSQL_ROOT_PASSWORD="..."
 *   node scripts/demo/snapshotEscolaDemo.js
 *
 * Restaurar (jornada → escola):
 *   $env:MYSQL_ROOT_PASSWORD="..."
 *   $env:DEMO_RESTORE="1"
 *   node scripts/demo/snapshotEscolaDemo.js --restore
 */
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const mysql = require("mysql2/promise");

const LIVE_DB = "coursehub_escola";
const SNAPSHOT_DB = process.env.DEMO_SNAPSHOT_DB || "coursehub_escola_jornada";

function quoteIdent(name) {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Nome de schema inválido: ${name}`);
  }

  return `\`${name}\``;
}

async function listBaseTables(conn, schema) {
  const [rows] = await conn.query(
    `
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `,
    [schema]
  );

  return rows.map((row) => row.TABLE_NAME);
}

async function listWritableColumns(conn, schema, tableName) {
  const [rows] = await conn.query(
    `
      SELECT COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND EXTRA NOT LIKE '%GENERATED%'
      ORDER BY ORDINAL_POSITION
    `,
    [schema, tableName]
  );

  return rows.map((row) => row.COLUMN_NAME);
}

async function cloneDatabase(conn, sourceDb, destDb) {
  const tables = await listBaseTables(conn, sourceDb);

  if (tables.length === 0) {
    throw new Error(`O schema ${sourceDb} não tem tabelas.`);
  }

  await conn.query(`DROP DATABASE IF EXISTS ${quoteIdent(destDb)}`);
  await conn.query(
    `CREATE DATABASE ${quoteIdent(destDb)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
  );

  await conn.query("SET FOREIGN_KEY_CHECKS = 0");

  for (const tableName of tables) {
    const [createRows] = await conn.query(
      `SHOW CREATE TABLE ${quoteIdent(sourceDb)}.${quoteIdent(tableName)}`
    );
    const ddl = createRows[0]["Create Table"].replace(
      /^CREATE TABLE `([^`]+)`/,
      `CREATE TABLE ${quoteIdent(destDb)}.\`$1\``
    );
    await conn.query(ddl);
    const columns = await listWritableColumns(conn, sourceDb, tableName);
    const columnList = columns.map((column) => quoteIdent(column)).join(", ");
    await conn.query(
      `INSERT INTO ${quoteIdent(destDb)}.${quoteIdent(tableName)} (${columnList})
       SELECT ${columnList} FROM ${quoteIdent(sourceDb)}.${quoteIdent(tableName)}`
    );
    process.stdout.write(`  ${tableName}\n`);
  }

  await conn.query("SET FOREIGN_KEY_CHECKS = 1");
}

async function main() {
  if (!process.env.MYSQL_ROOT_PASSWORD) {
    throw new Error("Defina MYSQL_ROOT_PASSWORD para clonar o banco.");
  }

  const restore = process.argv.includes("--restore");

  if (restore && process.env.DEMO_RESTORE !== "1") {
    throw new Error('Restaurar a escola exige $env:DEMO_RESTORE="1" (isso sobrescreve coursehub_escola).');
  }

  const sourceDb = restore ? SNAPSHOT_DB : LIVE_DB;
  const destDb = restore ? LIVE_DB : SNAPSHOT_DB;

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: "root",
    password: process.env.MYSQL_ROOT_PASSWORD,
    multipleStatements: true,
  });

  try {
    console.log(`${restore ? "Restaurando" : "Snapshot"}: ${sourceDb} → ${destDb}`);
    await cloneDatabase(conn, sourceDb, destDb);
    console.log(`Pronto. Cópia em ${destDb} (${(await listBaseTables(conn, destDb)).length} tabelas).`);
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
