const { withTransaction } = require("../../utils/dbTransaction");
const { assertValidTransition, canTransition } = require("./paymentStateMachine");
const { recalculateFinancialContractStatus } = require("./contractFinancialService");
const { createFinancialEvent } = require("./financialEventService");
const { notifyPaymentApproved, notifyAdminPaymentRejected } = require("./financialNotificationService");
const { resolveGatewayByName } = require("../paymentGateway/paymentGatewayFactory");
const {
  activateContractFromPaidInvoice,
  dispatchActivationNotifications,
  dispatchAdminEnrollmentNotification,
} = require("./activateContractService");

/**
 * O motor por trás TANTO da rota real de webhook do Mercado Pago
 * quanto da rota dev-only de "simular aprovação" -- elas só diferem
 * em como descobrem a tripla (gateway, gatewayPaymentId,
 * gatewayEventId) e no `source` que passam. Tudo depois disso (nunca
 * confiar no corpo da notificação, buscar de novo o estado
 * autoritativo no provider, validá-lo contra a linha local, aplicar
 * a máquina de estados sob lock de linha, e a trava de idempotência
 * em payment_events.gateway_event_id) é idêntico, então vive aqui
 * uma única vez em vez de duplicado por ponto de entrada.
 */

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

function getCurrentMysqlDateTime() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(
    now.getMinutes()
  )}:${pad(now.getSeconds())}`;
}

function convertToCents(value) {
  return Math.round(Number(value) * 100);
}

/**
 * Carrega o pagamento junto com tudo o que é necessário para validar
 * um resultado do gateway contra ele e, se aprovado, para fechar a
 * fatura/contrato -- sempre sob FOR UPDATE, para que dois chamadores
 * concorrentes (duas entregas de webhook, um webhook competindo com
 * a rota dev-simulate) serializem nesta linha exata em vez de se
 * intercalarem.
 */
async function lockPaymentForProcessing(connection, paymentId) {
  const [rows] = await connection.execute(
    `
      SELECT
        p.id, p.status, p.gateway, p.gateway_payment_id, p.amount, p.currency,
        p.external_reference, p.invoice_id, p.payment_method,
        i.status AS invoice_status, i.amount AS invoice_amount, i.description AS invoice_description,
        i.financial_contract_id,
        fc.enrollment_id, fc.student_id, fc.course_id,
        c.name AS course_name
      FROM payments p
      INNER JOIN invoices i ON i.id = p.invoice_id
      INNER JOIN financial_contracts fc ON fc.id = i.financial_contract_id
      INNER JOIN courses c ON c.id = fc.course_id
      WHERE p.id = ?
      FOR UPDATE
    `,
    [paymentId]
  );

  return rows[0] || null;
}

/** Payload sanitizado para payment_events.payload -- ver docs/features/payment-gateway.md#logs-e-payloads. */
function buildEventPayload(gatewayResult) {
  return {
    gatewayStatus: gatewayResult.gatewayStatus ?? null,
    gatewayStatusDetail: gatewayResult.gatewayStatusDetail ?? null,
    failureCode: gatewayResult.failureCode ?? null,
  };
}

async function insertPaymentEvent(connection, { paymentId, eventType, previousStatus, newStatus, source, gatewayEventId, payload }) {
  await connection.execute(
    `
      INSERT INTO payment_events (payment_id, event_type, previous_status, new_status, source, gateway_event_id, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [paymentId, eventType, previousStatus, newStatus, source, gatewayEventId, payload ? JSON.stringify(payload) : null]
  );
}

/**
 * Aplica "approved" a um pagamento já travado (locked). Idempotente:
 * um pagamento já aprovado é um no-op silencioso (um webhook repetido
 * para um dinheiro já registrado nunca pode re-executar os efeitos
 * colaterais de fatura/contrato/notificação). Protege o caso em que
 * a fatura já foi fechada por um pagamento DIFERENTE (duas tentativas
 * na mesma fatura que de fato foram ambas pagas pelo aluno) -- ver
 * docs/features/payment-gateway.md#pagamentos-duplicados-na-mesma-fatura:
 * o dinheiro nunca é perdido (o pagamento ainda é marcado como
 * aprovado nessa linha), mas a fatura não é tocada uma segunda vez e
 * um financial_event auditável sinaliza o caso para reconciliação
 * manual em vez de creditar duas vezes silenciosamente ou sobrescrever
 * paid_at.
 */
async function applyApproval(db, connection, row, gatewayResult) {
  if (row.status === "approved") {
    return { applied: false, reason: "already_approved" };
  }

  assertValidTransition(row.status, "approved");

  const paidAt = gatewayResult.paidAt || getCurrentMysqlDateTime();

  await connection.execute(
    `
      UPDATE payments
      SET status = 'approved',
          gateway_payment_id = ?,
          gateway_status = ?,
          gateway_status_detail = ?,
          currency = COALESCE(?, currency),
          paid_at = ?,
          last_synced_at = NOW()
      WHERE id = ?
    `,
    [gatewayResult.gatewayPaymentId, gatewayResult.gatewayStatus || null, gatewayResult.gatewayStatusDetail || null, gatewayResult.currency || null, paidAt, row.id]
  );

  if (row.invoice_status === "paid") {
    await createFinancialEvent(connection, {
      financialContractId: row.financial_contract_id,
      invoiceId: row.invoice_id,
      paymentId: row.id,
      enrollmentId: row.enrollment_id,
      eventType: "payment_approved_after_invoice_already_paid",
      source: "gateway",
      previousValue: { invoiceStatus: row.invoice_status },
      newValue: { paymentStatus: "approved", paidAt },
      reason:
        "O gateway confirmou este pagamento, mas a fatura já estava paga por outra tentativa. Requer reconciliação manual (ver docs/features/payment-gateway.md).",
    });

    return { applied: true, reason: "duplicate_invoice_payment" };
  }

  // Uma confirmação atrasada do gateway (webhook fora de ordem, ou um
  // aluno finalizando um checkout minutos depois da desistência já
  // ter sido registrada) nunca pode reabrir uma fatura cancelada ou
  // reembolsada -- isso reativaria o contrato/matrícula via
  // activateContractFromPaidInvoice logo abaixo, exatamente o que a
  // desistência (contractWithdrawalService) existe para evitar. O
  // dinheiro recebido nunca é perdido: o pagamento ainda é marcado
  // approved nesta linha (preserva o registro para reconciliação),
  // só a fatura/contrato/matrícula não são tocados. Mesmo padrão do
  // branch "invoice já paga" logo acima, só que para o caso "invoice
  // já fechada definitivamente".
  if (row.invoice_status === "cancelled" || row.invoice_status === "refunded") {
    await createFinancialEvent(connection, {
      financialContractId: row.financial_contract_id,
      invoiceId: row.invoice_id,
      paymentId: row.id,
      enrollmentId: row.enrollment_id,
      eventType: "payment_approved_after_invoice_cancelled",
      source: "gateway",
      previousValue: { invoiceStatus: row.invoice_status },
      newValue: { paymentStatus: "approved", paidAt },
      reason:
        "O gateway confirmou este pagamento, mas a fatura já estava cancelada ou reembolsada (ex.: desistência já registrada). O contrato e a matrícula NÃO foram reativados. Requer reconciliação manual.",
    });

    return { applied: true, reason: "invoice_already_closed" };
  }

  await connection.execute(`UPDATE invoices SET status = 'paid', paid_at = ?, cancelled_at = NULL WHERE id = ?`, [
    paidAt,
    row.invoice_id,
  ]);

  await connection.execute(
    `DELETE FROM invoice_collection_actions WHERE invoice_id = ? AND status IN ('pending', 'skipped')`,
    [row.invoice_id]
  );

  await createFinancialEvent(connection, {
    financialContractId: row.financial_contract_id,
    invoiceId: row.invoice_id,
    paymentId: row.id,
    enrollmentId: row.enrollment_id,
    eventType: "invoice_paid",
    source: "gateway",
    previousValue: { invoiceStatus: row.invoice_status },
    newValue: { invoiceStatus: "paid", paymentStatus: "approved", amount: Number(row.invoice_amount), paidAt },
    reason: "Pagamento confirmado pelo gateway.",
  });

  await recalculateFinancialContractStatus(connection, row.financial_contract_id);

  await notifyPaymentApproved(db, connection, {
    paymentId: row.id,
    invoiceId: row.invoice_id,
    invoiceDescription: row.invoice_description,
    amount: Number(row.invoice_amount).toFixed(2),
    studentId: row.student_id,
    courseId: row.course_id,
    courseName: row.course_name,
    paymentMethod: row.payment_method,
  });

  // Mesma regra central usada pelo pagamento manual do admin -- se
  // esta é a fatura de ativação do contrato, cria a matrícula e ativa
  // o contrato agora, dentro desta mesma transação. O convite de
  // ativação (e-mail) só é despachado depois que o chamador confirmar
  // o commit (ver processGatewayPaymentUpdate).
  const activationResult = await activateContractFromPaidInvoice(db, row.invoice_id, {
    connection,
    source: "gateway",
  });

  return { applied: true, reason: "approved", activationResult, paymentId: row.id, amount: Number(row.invoice_amount) };
}

/** Rejected/cancelled nunca tocam a fatura -- ela continua aberta para o aluno iniciar uma nova tentativa. */
async function applyTerminalNonApproval(db, connection, row, gatewayResult, targetStatus) {
  if (row.status === targetStatus) {
    return { applied: false, reason: `already_${targetStatus}` };
  }

  assertValidTransition(row.status, targetStatus);

  const timestampColumn = targetStatus === "rejected" ? "rejected_at" : "cancelled_at";

  await connection.execute(
    `
      UPDATE payments
      SET status = ?,
          gateway_payment_id = ?,
          gateway_status = ?,
          gateway_status_detail = ?,
          failure_code = ?,
          ${timestampColumn} = NOW(),
          last_synced_at = NOW()
      WHERE id = ?
    `,
    [
      targetStatus,
      gatewayResult.gatewayPaymentId,
      gatewayResult.gatewayStatus || null,
      gatewayResult.gatewayStatusDetail || null,
      gatewayResult.failureCode || null,
      row.id,
    ]
  );

  // Só "rejected" notifica admins -- é o único dos dois que representa
  // um problema genuíno de cobrança (gateway recusou o pagamento).
  // "cancelled" é o aluno desistindo da própria tentativa antes de
  // pagar, não um evento que precise de atenção administrativa.
  if (targetStatus === "rejected") {
    await notifyAdminPaymentRejected(db, connection, {
      paymentId: row.id,
      invoiceId: row.invoice_id,
      contractId: row.financial_contract_id,
      studentId: row.student_id,
      courseName: row.course_name,
      amount: row.amount,
      paymentMethod: row.payment_method,
      gateway: row.gateway,
      rejectionReason: gatewayResult.gatewayStatusDetail || gatewayResult.failureCode || null,
    });
  }

  return { applied: true, reason: targetStatus };
}

/**
 * Um chargeback chegou fora da banda (contestação na bandeira do
 * cartão), não solicitado pelo fluxo de reembolso do admin. Espelha
 * um reembolso no nível da fatura (o dinheiro não está mais com a
 * escola) sem reaproveitar paymentRefundService, cujo ponto de
 * entrada exige um ator admin e um motivo -- nenhum dos dois se
 * aplica a um chargeback iniciado pelo gateway.
 */
async function applyChargeback(db, connection, row, gatewayResult) {
  if (row.status === "chargeback") {
    return { applied: false, reason: "already_chargeback" };
  }

  assertValidTransition(row.status, "chargeback");

  await connection.execute(
    `
      UPDATE payments
      SET status = 'chargeback',
          gateway_status = ?,
          gateway_status_detail = ?,
          last_synced_at = NOW()
      WHERE id = ?
    `,
    [gatewayResult.gatewayStatus || null, gatewayResult.gatewayStatusDetail || null, row.id]
  );

  await connection.execute(`UPDATE invoices SET status = 'refunded' WHERE id = ?`, [row.invoice_id]);

  await createFinancialEvent(connection, {
    financialContractId: row.financial_contract_id,
    invoiceId: row.invoice_id,
    paymentId: row.id,
    enrollmentId: row.enrollment_id,
    eventType: "payment_chargeback",
    source: "gateway",
    previousValue: { paymentStatus: row.status, invoiceStatus: row.invoice_status },
    newValue: { paymentStatus: "chargeback", invoiceStatus: "refunded" },
    reason: "Chargeback recebido do gateway de pagamento.",
  });

  await recalculateFinancialContractStatus(connection, row.financial_contract_id);

  return { applied: true, reason: "chargeback" };
}

/**
 * Ponto de entrada único para "o gateway nos avisou que algo mudou
 * no pagamento X" -- chamado pela rota de webhook do Mercado Pago
 * (source = "gateway_webhook") e pela rota dev-only de simular
 * aprovação (source = "simulated_gateway"). Nunca confia na própria
 * noção do chamador sobre o novo status: sempre busca de novo o
 * pagamento autoritativo via getPayment() do adaptador do gateway.
 */
async function processGatewayPaymentUpdate(db, { gateway, gatewayPaymentId, gatewayEventId, source }) {
  if (!gatewayPaymentId) {
    return { matched: false, reason: "missing_gateway_payment_id" };
  }

  const [existingRows] = await db
    .promise()
    .query(`SELECT id FROM payments WHERE gateway = ? AND gateway_payment_id = ? LIMIT 1`, [gateway, gatewayPaymentId]);

  if (existingRows.length === 0) {
    // Nota estrutural (ver docs/features/payment-gateway.md#webhook-desconhecido):
    // payment_events.payment_id é NOT NULL e tem FK obrigatória,
    // então um evento para um pagamento sem linha local no CourseHub
    // não pode ser persistido ali sem enfraquecer essa restrição
    // para todas as outras linhas (que são combinadas e relevantes
    // para segurança). Uma migration mínima para torná-la anulável
    // não foi julgada como valendo a pena trocar essa garantia de
    // integridade por algo que deveria ser ruído operacional raro
    // (notificação em modo de teste, URL de webhook obsoleta/mal
    // configurada) -- logar já é suficiente para perceber e investigar
    // o padrão.
    console.warn("[paymentProcessingService] webhook for unknown local payment", {
      gateway,
      gatewayPaymentId,
      gatewayEventId,
      source,
    });

    return { matched: false, reason: "unknown_payment" };
  }

  const paymentId = existingRows[0].id;
  const gatewayInstance = resolveGatewayByName(gateway);
  const gatewayResult = await gatewayInstance.getPayment(gatewayPaymentId);

  const result = await withTransaction(db, async (connection) => {
    const row = await lockPaymentForProcessing(connection, paymentId);

    if (!row) {
      return { matched: false, reason: "unknown_payment" };
    }

    // Seção 25 do briefing: compara valor, moeda e referência externa
    // contra a NOSSA PRÓPRIA busca autoritativa (gatewayResult), nunca
    // contra o corpo não confiável do webhook -- uma divergência aqui
    // significa que a notificação aponta para um pagamento que não
    // corresponde de fato a essa linha local (má configuração, dado
    // de teste obsoleto, ou um data.id forjado que de alguma forma
    // passou pela checagem de assinatura).
    const expectedExternalReference = `invoice:${row.invoice_id}:payment:${row.id}`;
    const amountMatches = convertToCents(gatewayResult.amount ?? row.amount) === convertToCents(row.amount);
    const currencyMatches = !gatewayResult.currency || gatewayResult.currency === (row.currency || "BRL");
    const referenceMatches = !gatewayResult.externalReference || gatewayResult.externalReference === expectedExternalReference;

    if (!amountMatches || !currencyMatches || !referenceMatches) {
      console.error("[paymentProcessingService] gateway result failed validation, not applying", {
        paymentId: row.id,
        gateway,
        gatewayPaymentId,
        amountMatches,
        currencyMatches,
        referenceMatches,
      });

      return { matched: true, applied: false, reason: "validation_mismatch" };
    }

    if (gatewayEventId) {
      try {
        await insertPaymentEvent(connection, {
          paymentId: row.id,
          eventType: "gateway_status_notified",
          previousStatus: row.status,
          newStatus: gatewayResult.status,
          source,
          gatewayEventId,
          payload: buildEventPayload(gatewayResult),
        });
      } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
          // Esta entrega exata da notificação já foi processada em
          // uma chamada anterior -- o Mercado Pago reenvia
          // notificações idênticas até receber um 200, então este é
          // o caso normal de "mesmo webhook 10 vezes", não um erro.
          return { matched: true, applied: false, reason: "duplicate_delivery" };
        }

        throw error;
      }
    }

    if (!canTransition(row.status, gatewayResult.status)) {
      if (row.status === gatewayResult.status) {
        if (!gatewayEventId) {
          await insertPaymentEvent(connection, {
            paymentId: row.id,
            eventType: "gateway_status_notified",
            previousStatus: row.status,
            newStatus: gatewayResult.status,
            source,
            gatewayEventId: null,
            payload: buildEventPayload(gatewayResult),
          });
        }

        return { matched: true, applied: false, reason: "same_status_replay" };
      }

      // ex.: um "pending" fora de ordem chegando depois que "approved"
      // já foi aplicado (seção 33 do briefing) -- o pagamento não pode
      // voltar para trás. Registrado em log, não tratado como falha
      // de processamento, para que o provider não seja levado a
      // continuar tentando reenviar.
      console.warn("[paymentProcessingService] ignoring invalid/out-of-order transition", {
        paymentId: row.id,
        from: row.status,
        to: gatewayResult.status,
      });

      return { matched: true, applied: false, reason: "stale_out_of_order_transition" };
    }

    if (!gatewayEventId) {
      await insertPaymentEvent(connection, {
        paymentId: row.id,
        eventType: "gateway_status_notified",
        previousStatus: row.status,
        newStatus: gatewayResult.status,
        source,
        gatewayEventId: null,
        payload: buildEventPayload(gatewayResult),
      });
    }

    switch (gatewayResult.status) {
      case "approved":
        return { matched: true, ...(await applyApproval(db, connection, row, gatewayResult)) };
      case "rejected":
        return { matched: true, ...(await applyTerminalNonApproval(db, connection, row, gatewayResult, "rejected")) };
      case "cancelled":
        return { matched: true, ...(await applyTerminalNonApproval(db, connection, row, gatewayResult, "cancelled")) };
      case "chargeback":
        return { matched: true, ...(await applyChargeback(db, connection, row, gatewayResult)) };
      default:
        return { matched: true, applied: false, reason: "unsupported_target_status" };
    }
  });

  if (result?.activationResult?.activated) {
    await dispatchActivationNotifications(db, result.activationResult);
    await dispatchAdminEnrollmentNotification(db, {
      enrollmentId: result.activationResult.enrollmentId,
      contractId: result.activationResult.contractId,
      invoiceId: result.activationResult.invoiceId,
      studentId: result.activationResult.studentId,
      courseId: result.activationResult.courseId,
      origin: result.activationResult.origin,
      paymentId: result.paymentId,
      amount: result.amount,
    });
  }

  return result;
}

module.exports = {
  createServiceError,
  getCurrentMysqlDateTime,
  convertToCents,
  lockPaymentForProcessing,
  applyApproval,
  applyTerminalNonApproval,
  applyChargeback,
  processGatewayPaymentUpdate,
};
