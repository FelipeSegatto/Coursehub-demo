require("dotenv").config();

/**
 * Cada worker é um processo Node independente.
 *
 * Portanto ele também precisa carregar
 * todas as definições do notification registry.
 */
require(
  "../services/notifications/eventDefinitions"
);


const os = require("os");
const db = require("../db");

const {
  sendEmail,
} = require("../utils/mailer");

const {
  buildNotificationEmail,
} = require(
  "../email/templates/notificationEmail"
);

const {
  claimBatch,
  markDeliverySent,
  markDeliveryFailed,
  clearRecipientActionPath,
} = require(
  "../services/notifications/notificationDeliveryService"
);

const {
  getNotificationType,
} = require(
  "../services/notifications/notificationTypeRegistry"
);


/**
 * ============================================================
 * CONFIGURAÇÕES DO WORKER
 * ============================================================
 */
function getConfig() {
  return {
    /**
     * Identificador único desta instância.
     *
     * Exemplo:
     * DESKTOP-ABC:12345
     */
    workerId:
      process.env.NOTIFICATION_WORKER_ID ||
      `${os.hostname()}:${process.pid}`,

    /**
     * Quantos jobs serão buscados por ciclo.
     */
    batchSize:
      Number(
        process.env
          .NOTIFICATION_WORKER_BATCH_SIZE
      ) || 25,

    /**
     * Intervalo entre ciclos.
     *
     * 5000 ms = 5 segundos.
     */
    pollIntervalMs:
      Number(
        process.env
          .NOTIFICATION_WORKER_POLL_INTERVAL_MS
      ) || 5000,

    /**
     * Tempo do lease/lock de uma delivery.
     */
    leaseMinutes:
      Number(
        process.env
          .NOTIFICATION_WORKER_LEASE_MINUTES
      ) || 5,

    /**
     * Permite desligar o worker via .env.
     *
     * NOTIFICATION_WORKER_ENABLED=false
     */
    enabled:
      process.env
        .NOTIFICATION_WORKER_ENABLED !==
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
    (resolve) => setTimeout(resolve, ms)
  );
}


/**
 * ============================================================
 * PROCESSA UMA DELIVERY
 * ============================================================
 *
 * O parâmetro "job" só existe DENTRO desta função.
 *
 * É por isso que qualquer console.log utilizando:
 *
 * job.delivery_id
 * job.type
 * job.title
 *
 * precisa ficar aqui dentro.
 */
async function processJob(
  job,
  sendEmailFn = sendEmail
) {
  try {
    /**
     * --------------------------------------------------------
     * 1. MONTA O CONTEÚDO DO E-MAIL
     * --------------------------------------------------------
     */
    const actionLabel = getNotificationType(job.type)?.actionLabel;
    const {
      subject,
      text,
      html,
    } = buildNotificationEmail({
      title: job.title,
      message: job.message,
      actionPath: job.action_path,
      priority: job.priority,
      actionLabel,
    });


    /**
     * --------------------------------------------------------
     * 2. LOG DE DEBUG
     * --------------------------------------------------------
     *
     * Isso é especialmente útil no checkout.
     *
     * Agora você consegue identificar exatamente:
     *
     * - qual delivery está sendo enviada;
     * - qual tipo de notificação;
     * - qual destinatário;
     * - qual actionPath/token.
     */
    console.log(
      "\n=============================================="
    );

    console.log(
      "[notificationEmailWorker] PROCESSANDO:"
    );

    console.log({
      deliveryId:
        job.delivery_id,

      recipientId:
        job.recipient_id,

      notificationId:
        job.notification_id,

      type:
        job.type,

      title:
        job.title,

      destination:
        job.destination_snapshot,

      actionPath:
        job.action_path,
    });

    console.log(
      "==============================================\n"
    );


    /**
     * --------------------------------------------------------
     * 3. ENVIA O E-MAIL
     * --------------------------------------------------------
     */
    const result =
      await sendEmailFn({
        to:
          job.destination_snapshot,

        subject,

        text,

        html,
      });


    /**
     * --------------------------------------------------------
     * 4. PREVIEW DO ETHEREAL
     * --------------------------------------------------------
     *
     * Se estivermos em desenvolvimento e o mailer estiver
     * usando Ethereal, result.previewUrl contém a página
     * onde o e-mail pode ser visualizado.
     */
    if (
      process.env.NODE_ENV !==
        "production" &&
      result?.previewUrl
    ) {
      console.log(
        "\n=============================================="
      );

      console.log(
        "[notificationEmailWorker] PREVIEW DO E-MAIL:"
      );

      console.log(
        result.previewUrl
      );

      console.log(
        "==============================================\n"
      );
    }


    /**
     * --------------------------------------------------------
     * 5. MARCA A DELIVERY COMO ENVIADA
     * --------------------------------------------------------
     */
    await markDeliverySent(
      db,
      {
        deliveryId:
          job.delivery_id,

        providerMessageId:
          result.messageId,
      }
    );


    /**
     * --------------------------------------------------------
     * 6. REMOVE ACTION PATH SENSÍVEL
     * --------------------------------------------------------
     *
     * Algumas notificações possuem token/link sensível.
     *
     * Exemplo:
     *
     * checkout.email_verification_requested
     *
     * Para destinatário externo, apagamos o action_path
     * depois da entrega.
     */
    if (
      job.user_id === null &&
      getNotificationType(
        job.type
      )?.sensitiveActionPath
    ) {
      await clearRecipientActionPath(
        db,
        job.recipient_id
      );
    }


    /**
     * --------------------------------------------------------
     * 7. LOG DE SUCESSO
     * --------------------------------------------------------
     */
    console.log(
      `[notificationEmailWorker] delivery ${job.delivery_id} sent`
    );

  } catch (error) {

    /**
     * --------------------------------------------------------
     * 8. FALHA / RETRY
     * --------------------------------------------------------
     *
     * O worker não morre se um e-mail falhar.
     *
     * A delivery é marcada como falha e o service decide
     * se haverá nova tentativa.
     */
    try {
      const {
        exhausted,
        newAttemptCount,
      } =
        await markDeliveryFailed(
          db,
          {
            deliveryId:
              job.delivery_id,

            previousAttemptCount:
              job.attempt_count,

            errorMessage:
              error.message,
          }
        );


      console.error(
        `[notificationEmailWorker] delivery ${job.delivery_id} failed ` +
        `(attempt ${newAttemptCount}` +
        `${
          exhausted
            ? ", exhausted"
            : ", will retry"
        }): ${error.message}`
      );

    } catch (markError) {

      /**
       * Se até marcar a falha der problema,
       * mostramos os dois erros.
       */
      console.error(
        "[notificationEmailWorker] erro ao processar delivery:",
        error
      );

      console.error(
        "[notificationEmailWorker] erro adicional ao marcar falha:",
        markError
      );
    }
  }
}


/**
 * ============================================================
 * EXECUTA UM CICLO
 * ============================================================
 */
async function runCycle(
  config = getConfig(),
  sendEmailFn = sendEmail
) {

  /**
   * Worker desligado.
   */
  if (!config.enabled) {
    return {
      claimed: 0,
    };
  }


  /**
   * Busca as deliveries disponíveis.
   */
  const jobs =
    await claimBatch(
      db,
      {
        batchSize:
          config.batchSize,

        workerId:
          config.workerId,

        leaseMinutes:
          config.leaseMinutes,
      }
    );


  /**
   * Processa as deliveries uma por uma.
   */
  for (const job of jobs) {
    await processJob(
      job,
      sendEmailFn
    );
  }


  return {
    claimed:
      jobs.length,
  };
}


/**
 * ============================================================
 * HEARTBEAT
 * ============================================================
 *
 * O worker pode ficar bastante tempo sem nenhuma mensagem.
 *
 * Esse heartbeat ajuda a saber que ele não morreu.
 */
const HEARTBEAT_INTERVAL_MS =
  5 * 60 * 1000;


/**
 * ============================================================
 * START DO WORKER
 * ============================================================
 */
async function startWorker() {
  const config =
    getConfig();

  let running = true;

  let lastHeartbeatAt =
    Date.now();


  console.log(
    "\n=============================================="
  );

  console.log(
    "[notificationEmailWorker] WORKER INICIADO"
  );

  console.log({
    workerId:
      config.workerId,

    batchSize:
      config.batchSize,

    pollIntervalMs:
      config.pollIntervalMs,

    leaseMinutes:
      config.leaseMinutes,

    enabled:
      config.enabled,
  });

  console.log(
    "==============================================\n"
  );


  /**
   * ========================================================
   * SHUTDOWN
   * ========================================================
   */
  function requestShutdown(
    signal
  ) {

    /**
     * Evita imprimir a mesma mensagem várias vezes
     * caso Ctrl+C seja pressionado repetidamente.
     */
    if (!running) {
      return;
    }


    running = false;


    console.log(
      `\n[notificationEmailWorker] received ${signal}, ` +
      "shutting down after current cycle..."
    );
  }


  /**
   * .once() significa:
   *
   * processa o sinal apenas uma vez.
   */
  process.once(
    "SIGINT",
    () =>
      requestShutdown(
        "SIGINT"
      )
  );


  process.once(
    "SIGTERM",
    () =>
      requestShutdown(
        "SIGTERM"
      )
  );


  /**
   * ========================================================
   * LOOP PRINCIPAL
   * ========================================================
   */
  while (running) {

    try {

      const {
        claimed,
      } =
        await runCycle(
          config
        );


      /**
       * Se nenhuma delivery foi encontrada,
       * mostramos heartbeat periodicamente.
       */
      if (
        claimed === 0 &&
        Date.now() -
          lastHeartbeatAt >=
          HEARTBEAT_INTERVAL_MS
      ) {

        console.log(
          "[notificationEmailWorker] heartbeat: alive, idle"
        );

        lastHeartbeatAt =
          Date.now();
      }

    } catch (error) {

      /**
       * Um erro em um ciclo NÃO deve derrubar
       * o processo inteiro.
       */
      console.error(
        "[notificationEmailWorker] cycle error:"
      );

      console.error(
        error
      );


      if (
        process.env.NODE_ENV !==
          "production" &&
        error?.stack
      ) {
        console.error(
          error.stack
        );
      }
    }


    /**
     * Só espera se ainda não estivermos encerrando.
     */
    if (running) {

      await sleep(
        config.pollIntervalMs
      );
    }
  }


  /**
   * ========================================================
   * ENCERRAMENTO
   * ========================================================
   */
  try {

    /**
     * Fecha o pool/conexão do banco.
     */
    if (
      db &&
      typeof db.promise ===
        "function"
    ) {
      await db
        .promise()
        .end();
    }

  } catch (error) {

    console.error(
      "[notificationEmailWorker] erro ao fechar conexão com banco:",
      error.message
    );
  }


  console.log(
    "[notificationEmailWorker] stopped"
  );
}


/**
 * ============================================================
 * INICIALIZAÇÃO
 * ============================================================
 *
 * Quando executamos:
 *
 * node workers/notificationEmailWorker.js
 *
 * este bloco é executado.
 *
 * Mas quando um teste faz:
 *
 * require("./notificationEmailWorker")
 *
 * o worker NÃO inicia automaticamente.
 */
if (require.main === module) {

  startWorker()
    .catch((error) => {

      console.error(
        "\n=============================================="
      );

      console.error(
        "[notificationEmailWorker] ERRO FATAL"
      );

      console.error(
        error
      );


      if (error?.stack) {
        console.error(
          error.stack
        );
      }


      console.error(
        "==============================================\n"
      );


      process.exit(1);
    });
}


/**
 * ============================================================
 * EXPORTS
 * ============================================================
 *
 * Necessário para testes.
 */
module.exports = {
  runCycle,
  processJob,
  getConfig,
  startWorker,
};