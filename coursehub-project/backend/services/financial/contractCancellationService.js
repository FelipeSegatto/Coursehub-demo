/**
 * ============================================================
 * CANCELAMENTO DE CONTRATO FINANCEIRO
 * ============================================================
 *
 * Responsabilidades:
 *
 * contrato
 * ↓
 * cancelled
 *
 * invoice de ativação aberta
 * ↓
 * cancelled
 *
 * financial_event
 * ↓
 * contract_cancelled
 *
 * notification
 * ↓
 * aluno
 *
 * email
 * ↓
 * notification worker
 */


const {
  createFinancialEvent,
} = require(
  "./financialEventService"
);


const {
  notifyContractCancelled,
} = require(
  "./financialNotificationService"
);


/**
 * ============================================================
 * SERVICE ERROR
 * ============================================================
 */
function createServiceError(
  message,
  statusCode
) {

  const error =
    new Error(
      message
    );


  error.statusCode =
    statusCode;


  return error;
}


/**
 * ============================================================
 * CANCELAR CONTRATO
 * ============================================================
 */
async function cancelFinancialContract(
  db,
  contractId,
  {
    reason,
    actorUserId,
  }
) {

  const normalizedContractId =
    Number(
      contractId
    );


  /**
   * ==========================================================
   * VALIDAÇÃO
   * ==========================================================
   */
  if (
    !Number.isInteger(
      normalizedContractId
    ) ||
    normalizedContractId <=
      0
  ) {

    throw createServiceError(
      "ID do contrato inválido.",
      400
    );
  }


  if (!actorUserId) {

    throw createServiceError(
      "Administrador responsável é obrigatório.",
      401
    );
  }


  /**
   * Normaliza o motivo uma única vez.
   */
  const normalizedReason =
    typeof reason ===
      "string"
      ? reason.trim()
      : "";


  /**
   * ==========================================================
   * TRANSAÇÃO
   * ==========================================================
   */
  const connection =
    await db
      .promise()
      .getConnection();


  try {

    await connection
      .beginTransaction();


    /**
     * ========================================================
     * BUSCAR CONTRATO
     * ========================================================
     *
     * Agora buscamos também:
     *
     * student_id
     * course_id
     * course_name
     *
     * porque precisamos disso para notificar
     * corretamente o aluno.
     */
    const [
      contractRows,
    ] =
      await connection.query(
        `
          SELECT
            fc.id,
            fc.status,
            fc.activation_invoice_id,
            fc.enrollment_id,
            fc.student_id,
            fc.course_id,

            c.name AS course_name

          FROM financial_contracts fc

          INNER JOIN courses c
            ON c.id = fc.course_id

          WHERE fc.id = ?

          LIMIT 1

          FOR UPDATE
        `,
        [
          normalizedContractId,
        ]
      );


    if (
      contractRows.length ===
      0
    ) {

      throw createServiceError(
        "Contrato não encontrado.",
        404
      );
    }


    const contract =
      contractRows[0];


    /**
     * ========================================================
     * REGRAS
     * ========================================================
     */
    if (
      contract.status !==
      "pending_payment"
    ) {

      if (
        contract.status ===
        "cancelled"
      ) {

        throw createServiceError(
          "Este contrato já está cancelado.",
          409
        );
      }


      if (
        contract.status ===
        "completed"
      ) {

        throw createServiceError(
          "Um contrato concluído não pode ser cancelado.",
          409
        );
      }

      throw createServiceError(
        "Somente contratos aguardando o pagamento inicial podem ser cancelados. Contratos ativos ou em atraso usam o fluxo de desistência.",
        409
      );
    }


    /**
     * ========================================================
     * CANCELAR CONTRATO
     * ========================================================
     */
    await connection.query(
      `
        UPDATE financial_contracts

        SET
          status = 'cancelled',
          cancelled_at = NOW(),
          updated_at = NOW()

        WHERE id = ?
      `,
      [
        normalizedContractId,
      ]
    );


    /**
     * ========================================================
     * CANCELAR FATURA DE ATIVAÇÃO ABERTA
     * ========================================================
     *
     * Não mexemos em:
     *
     * paid
     * cancelled
     * refunded
     *
     * porque são estados históricos.
     */
    if (
      contract
        .activation_invoice_id
    ) {

      await connection.query(
        `
          UPDATE invoices

          SET
            status = 'cancelled',
            cancelled_at = NOW(),
            updated_at = NOW()

          WHERE id = ?

            AND status IN (
              'pending',
              'processing',
              'overdue'
            )
        `,
        [
          contract
            .activation_invoice_id,
        ]
      );
    }


    /**
     * ========================================================
     * AUDITORIA FINANCEIRA
     * ========================================================
     */
    await createFinancialEvent(
      connection,
      {
        financialContractId:
          normalizedContractId,

        enrollmentId:
          contract
            .enrollment_id,

        eventType:
          "contract_cancelled",

        source:
          "admin",

        actorUserId,

        previousValue: {
          status:
            contract.status,
        },

        newValue: {
          status:
            "cancelled",
        },

        reason:
          normalizedReason ||
          null,
      }
    );


    /**
     * ========================================================
     * NOTIFICAÇÃO DO ALUNO
     * ========================================================
     *
     * Essa é a principal adição.
     *
     *
     * Cria:
     *
     * notifications
     * ↓
     * notification_recipients
     * ↓
     * notification_deliveries
     *
     *
     * Como passamos a mesma connection,
     * a notificação participa da transação.
     */
    await notifyContractCancelled(
      db,
      connection,
      {
        contractId:
          normalizedContractId,

        studentId:
          contract.student_id,

        courseId:
          contract.course_id,

        courseName:
          contract.course_name,

        reason:
          normalizedReason ||
          null,

        actorUserId,
      }
    );


    /**
     * ========================================================
     * COMMIT
     * ========================================================
     *
     * Só depois que:
     *
     * contrato
     * invoice
     * evento
     * notificação
     *
     * estiverem corretos.
     */
    await connection
      .commit();


    return {
      contractId:
        normalizedContractId,

      status:
        "cancelled",

      notificationCreated:
        true,
    };

  } catch (error) {

    await connection
      .rollback();


    throw error;

  } finally {

    connection
      .release();
  }
}


/**
 * ============================================================
 * EXPORTS
 * ============================================================
 */
module.exports = {

  createServiceError,

  cancelFinancialContract,
};