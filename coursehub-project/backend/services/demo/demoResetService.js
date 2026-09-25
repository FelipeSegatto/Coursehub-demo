const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const simulatedGateway = require("../paymentGateway/simulatedGateway");

const LIVE_DB = process.env.DB_NAME || "coursehub_escola";
const SNAPSHOT_DB = process.env.DEMO_SNAPSHOT_DB || "coursehub_escola_jornada";
const DEFAULT_DELAY_MS = 60 * 60 * 1000;
const RETRY_DELAY_MS = 60 * 1000;

let resetInProgress = null;
let deadlineAt = null;
let timer = null;

function isDemoResetEnabled() {
  return String(process.env.DEMO_RESET_ON_LOGOUT || "").toLowerCase() === "true";
}

function resetDelayMs() {
  const configured = Number(process.env.DEMO_RESET_DELAY_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_DELAY_MS;
}

function deadlineFilePath() {
  return (
    process.env.DEMO_RESET_STATE_PATH ||
    path.join(__dirname, "../../storage/demo-reset-at.json")
  );
}

function readDeadline() {
  try {
    const raw = fs.readFileSync(deadlineFilePath(), "utf8");
    const parsed = Date.parse(JSON.parse(raw).resetAt);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeDeadline(timestamp) {
  const filePath = deadlineFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify({ resetAt: new Date(timestamp).toISOString() }));
  fs.renameSync(temporaryPath, filePath);
}

function clearDeadlineFile() {
  try {
    fs.unlinkSync(deadlineFilePath());
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function quoteIdent(name) {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Nome de schema/tabela inválido: ${name}`);
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

async function runReset() {
  if (!isDemoResetEnabled()) {
    return { reset: false, reason: "disabled" };
  }

  if (LIVE_DB === SNAPSHOT_DB) {
    throw new Error("DEMO_SNAPSHOT_DB deve ser diferente de DB_NAME.");
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DEMO_RESET_DB_USER || process.env.DB_USER,
    password: process.env.DEMO_RESET_DB_PASSWORD || process.env.DB_PASSWORD,
    multipleStatements: false,
  });

  try {
    const snapshotTables = await listBaseTables(conn, SNAPSHOT_DB);
    const liveTables = await listBaseTables(conn, LIVE_DB);

    if (snapshotTables.length === 0) {
      throw new Error(`O snapshot ${SNAPSHOT_DB} não existe ou está vazio.`);
    }

    const missingLive = snapshotTables.filter((table) => !liveTables.includes(table));
    if (missingLive.length > 0) {
      throw new Error(`O banco ativo não possui tabelas do snapshot: ${missingLive.join(", ")}`);
    }

    await conn.beginTransaction();
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");

    try {
      // Limpa primeiro para que dados criados durante a navegação da demo
      // (pagamentos, chats, leituras, envios etc.) desapareçam por completo.
      for (const tableName of snapshotTables) {
        await conn.query(`DELETE FROM ${quoteIdent(LIVE_DB)}.${quoteIdent(tableName)}`);
      }

      // Repõe exatamente o snapshot inicial da jornada.
      for (const tableName of snapshotTables) {
        const columns = await listWritableColumns(conn, SNAPSHOT_DB, tableName);

        if (columns.length === 0) {
          continue;
        }

        const columnList = columns.map(quoteIdent).join(", ");

        await conn.query(
          `INSERT INTO ${quoteIdent(LIVE_DB)}.${quoteIdent(tableName)} (${columnList})\n` +
            `SELECT ${columnList} FROM ${quoteIdent(SNAPSHOT_DB)}.${quoteIdent(tableName)}`
        );
      }

      // A demo sempre deve reabrir com as notificações iniciais como
      // não lidas e não arquivadas. Isso evita que um snapshot criado
      // depois de uma leitura preserve acidentalmente read_at/archived_at.
      if (liveTables.includes("notification_recipients")) {
        await conn.query(
          `UPDATE ${quoteIdent(LIVE_DB)}.${quoteIdent("notification_recipients")}
           SET read_at = NULL, archived_at = NULL`
        );
      }

      // Tokens de autenticação nunca devem renascer a partir do snapshot.
      // O conteúdo funcional volta ao estado-base, mas todas as sessões
      // antigas permanecem encerradas.
      for (const tokenTable of [
        "refresh_tokens",
        "password_reset_tokens",
        "account_activation_tokens",
      ]) {
        if (liveTables.includes(tokenTable)) {
          await conn.query(`DELETE FROM ${quoteIdent(LIVE_DB)}.${quoteIdent(tokenTable)}`);
        }
      }

      await conn.query("SET FOREIGN_KEY_CHECKS = 1");
      await conn.commit();
    } catch (error) {
      try {
        await conn.query("SET FOREIGN_KEY_CHECKS = 1");
      } catch (_) {
        // Mantemos o erro original.
      }
      await conn.rollback();
      throw error;
    }

    // O gateway simulado guarda pagamentos em memória. Se não limparmos,
    // um timer de autoaprovação criado antes do reset pode reaparecer
    // depois do banco já ter sido restaurado.
    if (typeof simulatedGateway.resetStore === "function") {
      simulatedGateway.resetStore();
    }

    const { shiftRoteiroDueDatesToToday } = require("./demoDueDates");
    const { applyDemoBaseline } = require("../../scripts/demo/seedCompletionRules");
    await applyDemoBaseline().catch((baselineError) => {
      console.error("Falha ao reaplicar as regras de conclusão depois do reset:", baselineError.message);
    });
    await shiftRoteiroDueDatesToToday().catch((shiftError) => {
      console.error("Falha ao alinhar o vencimento do roteiro depois do reset:", shiftError.message);
    });

    return {
      reset: true,
      source: SNAPSHOT_DB,
      destination: LIVE_DB,
      tableCount: snapshotTables.length,
    };
  } finally {
    await conn.end();
  }
}

async function restoreDemoSnapshot() {
  if (resetInProgress) {
    return resetInProgress;
  }

  resetInProgress = runReset().finally(() => {
    resetInProgress = null;
  });

  return resetInProgress;
}

function armTimer() {
  if (timer) clearTimeout(timer);
  if (deadlineAt === null) return;

  const armedFor = deadlineAt;
  timer = setTimeout(() => {
    timer = null;
    fireScheduledReset(armedFor).catch((error) => {
      console.error("Erro ao restaurar o snapshot da demo:", error);
    });
  }, Math.max(0, armedFor - Date.now()));

  if (typeof timer.unref === "function") timer.unref();
}

async function fireScheduledReset(armedFor) {
  if (!isDemoResetEnabled() || deadlineAt !== armedFor) return;

  if (Date.now() + 250 < deadlineAt) {
    armTimer();
    return;
  }

  try {
    await restoreDemoSnapshot();
  } catch (error) {
    console.error("Erro ao restaurar o snapshot da demo. Nova tentativa em 1 minuto:", error);
    if (deadlineAt === armedFor) {
      deadlineAt = Date.now() + RETRY_DELAY_MS;
      writeDeadline(deadlineAt);
      armTimer();
    }
    return;
  }

  if (deadlineAt === armedFor) {
    deadlineAt = null;
    clearDeadlineFile();
  }
}

function scheduleDemoResetAfterLogin(now = Date.now()) {
  if (!isDemoResetEnabled()) {
    return { scheduled: false, reason: "disabled" };
  }

  deadlineAt = now + resetDelayMs();
  writeDeadline(deadlineAt);
  armTimer();

  return { scheduled: true, resetAt: new Date(deadlineAt).toISOString() };
}

function resumeDemoResetSchedule() {
  if (!isDemoResetEnabled()) return;

  deadlineAt = readDeadline();
  if (deadlineAt === null) return;

  armTimer();
}

module.exports = {
  isDemoResetEnabled,
  restoreDemoSnapshot,
  scheduleDemoResetAfterLogin,
  resumeDemoResetSchedule,
};
