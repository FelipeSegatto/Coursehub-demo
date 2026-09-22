/**
 * Concede ao usuário normal da aplicação acesso SOMENTE de leitura ao
 * snapshot usado pelo reset no logout.
 *
 * Uso (PowerShell):
 *   $env:MYSQL_ROOT_PASSWORD="SUA_SENHA_ROOT"
 *   node scripts/demo/prepareDemoResetPermissions.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });

const mysql = require("mysql2/promise");

function safeIdent(value, label) {
  if (!/^[a-zA-Z0-9_]+$/.test(value || "")) {
    throw new Error(`${label} inválido: ${value}`);
  }
  return value;
}

function escapeSqlString(value) {
  return String(value).replace(/'/g, "''");
}

async function main() {
  if (!process.env.MYSQL_ROOT_PASSWORD) {
    throw new Error("Defina MYSQL_ROOT_PASSWORD antes de executar este script.");
  }

  const snapshotDb = safeIdent(process.env.DEMO_SNAPSHOT_DB || "coursehub_escola_jornada", "DEMO_SNAPSHOT_DB");
  const appUser = process.env.DB_USER;
  const appHost = process.env.DB_USER_HOST || "localhost";

  if (!appUser) {
    throw new Error("DB_USER não definido no .env.");
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: "root",
    password: process.env.MYSQL_ROOT_PASSWORD,
  });

  try {
    const [schemas] = await conn.query(
      "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?",
      [snapshotDb]
    );

    if (!schemas.length) {
      throw new Error(`Snapshot ${snapshotDb} não existe. Rode npm run demo:snapshot primeiro.`);
    }

    const userLiteral = `'${escapeSqlString(appUser)}'@'${escapeSqlString(appHost)}'`;
    await conn.query(`GRANT SELECT ON \`${snapshotDb}\`.* TO ${userLiteral}`);
    await conn.query("FLUSH PRIVILEGES");

    console.log(`OK: ${appUser}@${appHost} pode ler ${snapshotDb}.`);
    console.log("O reset no logout já pode copiar o snapshot usando DB_USER/DB_PASSWORD.");
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
