require("dotenv").config();
require("../services/notifications/eventDefinitions");

const os = require("os");
const path = require("path");
const db = require("../db");
const {
  claimBatch,
  markReady,
  markFailed,
} = require("../services/documents/generatedDocumentService");
const { renderHtmlToPdf, closeBrowser, hashBuffer } = require("../services/documents/documentRendererService");
const { saveDocument } = require("../services/documents/documentStorageService");
const { createNotificationEvent } = require("../services/notifications/notificationService");
const {
  WORKER_BATCH_SIZE,
  WORKER_POLL_INTERVAL_MS,
  WORKER_LEASE_MINUTES,
  WORKER_ENABLED,
} = require("../config/documentGenerationConfig");

function getConfig() {
  return {
    workerId: process.env.DOCUMENT_WORKER_ID || `${os.hostname()}:${process.pid}`,
    batchSize: Number(process.env.DOCUMENT_WORKER_BATCH_SIZE) || WORKER_BATCH_SIZE,
    pollIntervalMs: Number(process.env.DOCUMENT_WORKER_POLL_INTERVAL_MS) || WORKER_POLL_INTERVAL_MS,
    leaseMinutes: Number(process.env.DOCUMENT_WORKER_LEASE_MINUTES) || WORKER_LEASE_MINUTES,
    // Kill switch: set DOCUMENT_WORKER_ENABLED=false to stop claiming
    // new work without deploying code (restart the worker process to
    // pick up the change -- plain env var, not live-reloaded).
    enabled: process.env.DOCUMENT_WORKER_ENABLED !== undefined
      ? process.env.DOCUMENT_WORKER_ENABLED !== "false"
      : WORKER_ENABLED,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Só notifica quando quem pediu a geração é um aluno (accessContext
 * scope='student' no momento do enqueue) -- um admin gerando pela
 * própria tela acompanha por polling, não precisa de notificação.
 * Não há uma coluna dedicada para essa distinção; o role do
 * solicitante já resolve isso sem precisar de uma nova coluna.
 */
async function notifyIfRequestedByStudent(job) {
  if (!job.generated_by_user_id) return;

  const [rows] = await db
    .promise()
    .query(`SELECT role FROM users WHERE id = ? LIMIT 1`, [job.generated_by_user_id]);

  if (rows[0]?.role !== "student") return;

  await createNotificationEvent(db, {
    type: "financial.document.ready",
    sourceType: "generated_document",
    sourceId: job.id,
    context: {
      documentType: job.document_type,
      generatedDocumentId: job.id,
    },
    recipients: [{ userId: job.generated_by_user_id }],
    excludeActor: false,
  });
}

/**
 * Processa um job já reivindicado (status='generating'). Nunca lança
 * -- uma falha de renderer/storage é registrada via markFailed, nunca
 * propagada, para um documento ruim nunca travar o lote inteiro.
 * A notificação de sucesso só é disparada DEPOIS de markReady, nunca
 * antes -- uma falha de renderização nunca notifica sucesso.
 */
async function processJob(job) {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const template = require(path.join("..", "services", "documents", "templates", job.template_path));

    const snapshot = typeof job.snapshot_json === "string" ? JSON.parse(job.snapshot_json) : job.snapshot_json;
    const html = template.render(snapshot);

    const pdfBuffer = await renderHtmlToPdf(html);
    const fileHash = hashBuffer(pdfBuffer);

    const { storageKey } = await saveDocument(pdfBuffer, {
      documentType: job.document_type,
      generatedDocumentId: job.id,
    });

    await markReady(db, job.id, {
      storageKey,
      fileHash,
      fileSizeBytes: pdfBuffer.length,
    });

    await notifyIfRequestedByStudent(job).catch((notificationError) => {
      console.error(
        `[documentGenerationWorker] document ${job.id} ready, but notification failed:`,
        notificationError.message
      );
    });

    console.log(`[documentGenerationWorker] document ${job.id} (${job.document_type}) ready`);
  } catch (error) {
    await markFailed(db, job.id, { failureReason: error.message });

    console.error(`[documentGenerationWorker] document ${job.id} failed: ${error.message}`);
  }
}

async function runCycle(config = getConfig()) {
  if (!config.enabled) {
    return { claimed: 0 };
  }

  const jobs = await claimBatch(db, {
    batchSize: config.batchSize,
    workerId: config.workerId,
    leaseMinutes: config.leaseMinutes,
  });

  for (const job of jobs) {
    await processJob(job);
  }

  return { claimed: jobs.length };
}

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

async function startWorker() {
  const config = getConfig();
  let running = true;
  let lastHeartbeatAt = Date.now();

  console.log(
    `[documentGenerationWorker] starting (workerId=${config.workerId}, batchSize=${config.batchSize}, pollIntervalMs=${config.pollIntervalMs}, enabled=${config.enabled})`
  );

  function requestShutdown(signal) {
    console.log(`[documentGenerationWorker] received ${signal}, shutting down after current cycle`);
    running = false;
  }

  process.on("SIGINT", () => requestShutdown("SIGINT"));
  process.on("SIGTERM", () => requestShutdown("SIGTERM"));

  // Sequential loop by design, same as notificationEmailWorker -- the
  // next cycle only starts after the previous one fully finishes.
  while (running) {
    try {
      const { claimed } = await runCycle(config);

      if (claimed === 0 && Date.now() - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
        console.log("[documentGenerationWorker] heartbeat: alive, idle");
        lastHeartbeatAt = Date.now();
      }
    } catch (error) {
      console.error("[documentGenerationWorker] cycle error:", error.message);
    }

    if (running) {
      await sleep(config.pollIntervalMs);
    }
  }

  await closeBrowser();
  await db.promise().end();
  console.log("[documentGenerationWorker] stopped");
}

/**
 * Roda o ciclo dentro do processo da API. O processo dedicado
 * (docker worker-documents) continua existindo; a API do compose
 * desliga este laço com DOCUMENT_WORKER_EMBEDDED=false para não
 * abrir um segundo Chrome.
 */
function startEmbeddedWorker() {
  if (process.env.DOCUMENT_WORKER_EMBEDDED === "false") return;

  const config = getConfig();

  if (!config.enabled) return;

  console.log(
    `[documentGenerationWorker] embedded (workerId=${config.workerId}, pollIntervalMs=${config.pollIntervalMs})`
  );

  const loop = async () => {
    while (true) {
      try {
        await runCycle(config);
      } catch (error) {
        console.error("[documentGenerationWorker] cycle error:", error.message);
      }

      await sleep(config.pollIntervalMs);
    }
  };

  loop();
}

if (require.main === module) {
  startWorker();
}

module.exports = { runCycle, processJob, getConfig, startEmbeddedWorker };
