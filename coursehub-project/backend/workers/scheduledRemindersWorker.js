require("dotenv").config();

/**
 * ============================================================
 * REGISTRAR TODOS OS TIPOS DE NOTIFICAÇÃO
 * ============================================================
 *
 * IMPORTANTE:
 *
 * Cada worker Node é um processo separado.
 *
 * O server.js já executa:
 *
 * require("./services/notifications/eventDefinitions");
 *
 * mas isso NÃO registra os eventos dentro deste worker,
 * porque este arquivo roda em outro processo Node.
 *
 * Portanto precisamos carregar o registry também aqui.
 *
 * Isso registra, entre outros:
 *
 * financial.invoice.reminder
 * financial.invoice.overdue
 * financial.invoice.overdue_charge_warning
 * financial.enrollment.lock_warning
 * financial.enrollment.locked
 */
require(
  "../services/notifications/eventDefinitions"
);


const db =
  require("../db");


const {
  generateMissingCollectionActions,
  processDueCollectionActions,
} = require(
  "../services/financial/invoiceCollectionActionService"
);


/**
 * ============================================================
 * CONFIGURAÇÃO
 * ============================================================
 */
function getConfig() {

  return {

    /**
     * Quantas ações financeiras
     * podem ser processadas por ciclo.
     */
    batchSize:
      Number(
        process.env
          .SCHEDULED_REMINDERS_WORKER_BATCH_SIZE
      ) ||
      50,


    /**
     * Intervalo entre os ciclos.
     *
     * Produção:
     * normalmente 1 hora.
     *
     * Desenvolvimento:
     * pode usar 10 segundos para testes.
     */
    pollIntervalMs:
      Number(
        process.env
          .SCHEDULED_REMINDERS_WORKER_POLL_INTERVAL_MS
      ) ||
      3600000,


    /**
     * Kill switch do worker.
     *
     * false:
     * não gera nem processa ações.
     */
    enabled:
      process.env
        .SCHEDULED_REMINDERS_WORKER_ENABLED !==
      "false",
  };
}


/**
 * ============================================================
 * SLEEP
 * ============================================================
 */
function sleep(ms) {

  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms
      )
  );
}


/**
 * ============================================================
 * EXECUTAR UM CICLO
 * ============================================================
 *
 * O ciclo faz duas coisas:
 *
 * 1. garante que as invoices abertas tenham
 *    suas ações programadas;
 *
 * 2. processa ações cujo scheduled_for <= hoje.
 */
async function runCycle(
  config =
    getConfig()
) {

  if (
    !config.enabled
  ) {

    return {
      generated: 0,
      claimed: 0,
      processed: 0,
      skipped: 0,
    };
  }


  /**
   * ==========================================================
   * GERAR AÇÕES QUE ESTÃO FALTANDO
   * ==========================================================
   *
   * Exemplo:
   *
   * invoice due 25/08
   *
   * gera:
   *
   * reminder_3_days_before
   * due_date_notice
   * marked_overdue
   * overdue_charge_10_days
   * lock_warning_15_days
   * enrollment_locked_30_days
   */
  const {
    affectedRows:
      generated,
  } =
    await generateMissingCollectionActions(
      db
    );


  /**
   * ==========================================================
   * PROCESSAR AÇÕES VENCIDAS
   * ==========================================================
   */
  const {
    claimed,
    processed,
    skipped,
  } =
    await processDueCollectionActions(
      db,
      {
        batchSize:
          config.batchSize,
      }
    );


  return {
    generated,
    claimed,
    processed,
    skipped,
  };
}


/**
 * ============================================================
 * WORKER PRINCIPAL
 * ============================================================
 */
async function startWorker() {

  const config =
    getConfig();


  let running =
    true;


  console.log(
    `[scheduledRemindersWorker] starting ` +
      `(batchSize=${config.batchSize}, ` +
      `pollIntervalMs=${config.pollIntervalMs}, ` +
      `enabled=${config.enabled}, ` +
      `autoLock=${process.env.ENABLE_ENROLLMENT_AUTO_LOCK === "true"})`
  );


  /**
   * ==========================================================
   * SHUTDOWN GRACIOSO
   * ==========================================================
   */
  function requestShutdown(
    signal
  ) {

    console.log(
      `[scheduledRemindersWorker] received ${signal}, ` +
        "shutting down after current cycle"
    );


    running =
      false;
  }


  process.on(
    "SIGINT",
    () =>
      requestShutdown(
        "SIGINT"
      )
  );


  process.on(
    "SIGTERM",
    () =>
      requestShutdown(
        "SIGTERM"
      )
  );


  /**
   * ==========================================================
   * LOOP
   * ==========================================================
   */
  while (
    running
  ) {

    try {

      const result =
        await runCycle(
          config
        );


      console.log(
        `[scheduledRemindersWorker] cycle: ` +
          `generated=${result.generated} ` +
          `claimed=${result.claimed} ` +
          `processed=${result.processed} ` +
          `skipped=${result.skipped}`
      );

    } catch (
      error
    ) {

      console.error(
        "[scheduledRemindersWorker] cycle error:",
        error
      );
    }


    if (
      running
    ) {

      await sleep(
        config.pollIntervalMs
      );
    }
  }


  /**
   * Fecha a conexão apenas
   * quando o worker realmente termina.
   */
  await db
    .promise()
    .end();


  console.log(
    "[scheduledRemindersWorker] stopped"
  );
}


/**
 * ============================================================
 * EXECUÇÃO DIRETA
 * ============================================================
 */
if (
  require.main ===
  module
) {

  startWorker();
}


/**
 * ============================================================
 * EXPORTS PARA TESTES
 * ============================================================
 */
module.exports = {
  runCycle,
  getConfig,
};