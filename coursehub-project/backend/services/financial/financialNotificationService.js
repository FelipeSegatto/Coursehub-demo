const {
  createNotificationEvent,
} = require(
  "../notifications/notificationService"
);


const {
  resolveStudentOwner,
  resolveAllActiveAdmins,
} = require(
  "../notifications/notificationRecipientResolvers"
);


/**
 * ============================================================
 * NOTIFICAÇÕES FINANCEIRAS COMPARTILHADAS
 * ============================================================
 *
 * Este service centraliza eventos que precisam
 * resolver:
 *
 * financial entity
 * ↓
 * aluno
 * ↓
 * user
 * ↓
 * inbox + email
 */


/**
 * ============================================================
 * FATURA ALTERADA
 * ============================================================
 */
async function notifyInvoiceChanged(
  db,
  connection,
  {
    invoiceId,
    invoiceDescription,
    changeType,
    previousValue,
    newValue,
    studentId,
    courseId,
    courseName,
  }
) {

  const recipient =
    await resolveStudentOwner(
      connection,
      {
        studentId,
      }
    );


  if (!recipient) {
    return;
  }


  await createNotificationEvent(
    db,
    {
      type:
        "financial.invoice.changed",

      sourceType:
        "invoice",

      sourceId:
        invoiceId,

      courseId,

      context: {
        invoiceId,
        invoiceDescription,
        changeType,
        previousValue,
        newValue,
        courseId,
        courseName,
      },

      recipients: [
        recipient,
      ],

      connection,
    }
  );
}


/**
 * ============================================================
 * FATURA CANCELADA
 * ============================================================
 */
async function notifyInvoiceCancelled(
  db,
  connection,
  {
    invoiceId,
    invoiceDescription,
    reason,
    studentId,
    courseId,
    courseName,
  }
) {

  const recipient =
    await resolveStudentOwner(
      connection,
      {
        studentId,
      }
    );


  if (!recipient) {
    return;
  }


  await createNotificationEvent(
    db,
    {
      type:
        "financial.invoice.cancelled",

      sourceType:
        "invoice",

      sourceId:
        invoiceId,

      courseId,

      context: {
        invoiceId,
        invoiceDescription,
        reason:
          reason ||
          null,

        courseId,
        courseName,
      },

      recipients: [
        recipient,
      ],

      connection,
    }
  );
}


/**
 * ============================================================
 * CONTRATO DE CURSO CANCELADO
 * ============================================================
 *
 * NOVO.
 *
 * Responsável por:
 *
 * contrato cancelado
 * ↓
 * aluno proprietário
 * ↓
 * notification
 * ↓
 * notification_recipient
 * ↓
 * notification_delivery
 * ↓
 * worker envia email
 */
async function notifyContractCancelled(
  db,
  connection,
  {
    contractId,
    studentId,
    courseId,
    courseName,
    reason,
    actorUserId,
  }
) {

  /**
   * Resolve:
   *
   * student.id
   * ↓
   * users.id
   * ↓
   * nome/e-mail/role
   */
  const recipient =
    await resolveStudentOwner(
      connection,
      {
        studentId,
      }
    );


  /**
   * Se por algum problema estrutural
   * o aluno não tiver usuário,
   * não derrubamos silenciosamente
   * um recipient inválido.
   */
  if (!recipient) {
    return;
  }


  await createNotificationEvent(
    db,
    {
      /**
       * Tipo que acabamos de registrar.
       */
      type:
        "financial.contract.cancelled",


      /**
       * Fonte do evento.
       */
      sourceType:
        "financial_contract",


      sourceId:
        contractId,


      /**
       * Admin que realizou
       * o cancelamento.
       */
      actorUserId:
        actorUserId ||
        null,


      courseId,


      /**
       * Dados usados pelo registry
       * para montar título/mensagem.
       */
      context: {
        contractId,
        studentId,
        courseId,
        courseName,

        reason:
          reason ||
          null,
      },


      /**
       * Destinatário:
       *
       * aluno do contrato.
       */
      recipients: [
        recipient,
      ],


      /**
       * Faz parte da mesma transação
       * do cancelamento.
       *
       * Assim:
       *
       * ou contrato + notificação commitam
       *
       * ou tudo faz rollback.
       */
      connection,
    }
  );
}


/**
 * ============================================================
 * DESISTÊNCIA DE CONTRATO REGISTRADA
 * ============================================================
 *
 * Mesmo mecanismo de notifyContractCancelled, tipo de evento
 * diferente (financial.contract.withdrawn) -- ver
 * eventDefinitions/financialContractWithdrawn.js para a distinção de
 * quando cada um é disparado.
 */
async function notifyContractWithdrawn(
  db,
  connection,
  {
    contractId,
    studentId,
    courseId,
    courseName,
    reason,
    actorUserId,
  }
) {

  const recipient =
    await resolveStudentOwner(
      connection,
      {
        studentId,
      }
    );


  if (!recipient) {
    return;
  }


  await createNotificationEvent(
    db,
    {
      type:
        "financial.contract.withdrawn",


      sourceType:
        "financial_contract",


      sourceId:
        contractId,


      /**
       * Admin que registrou a desistência.
       */
      actorUserId:
        actorUserId ||
        null,


      courseId,


      context: {
        contractId,
        studentId,
        courseId,
        courseName,

        reason:
          reason ||
          null,
      },


      recipients: [
        recipient,
      ],


      /**
       * Mesma transação do encerramento do
       * contrato + matrícula -- ou tudo
       * commita junto, ou tudo faz rollback.
       */
      connection,
    }
  );
}


/**
 * ============================================================
 * PAGAMENTO REJEITADO (ADMIN)
 * ============================================================
 *
 * Diferente das demais notificações deste arquivo: o destinatário é
 * "todos os admins ativos" (resolveAllActiveAdmins), não o aluno --
 * um pagamento rejeitado é um problema operacional que a
 * administração precisa acompanhar, não um aviso ao aluno (o aluno já
 * vê o erro na hora, no checkout). Chamado de dentro de
 * applyTerminalNonApproval SÓ quando a transição real para 'rejected'
 * de fato acontece (nunca em reprocessamento do mesmo webhook, que já
 * é barrado mais acima por payment_events.gateway_event_id e pelo
 * próprio `row.status === targetStatus` no-op).
 */
async function notifyAdminPaymentRejected(
  db,
  connection,
  {
    paymentId,
    invoiceId,
    contractId,
    studentId,
    courseName,
    amount,
    paymentMethod,
    gateway,
    rejectionReason,
  }
) {

  const admins =
    await resolveAllActiveAdmins(
      connection
    );

  if (admins.length === 0) {
    return;
  }

  const [[studentRow]] =
    await connection.query(
      `SELECT name FROM students WHERE id = ? LIMIT 1`,
      [studentId]
    );

  await createNotificationEvent(
    db,
    {
      type:
        "admin.payment.rejected",

      sourceType:
        "payment",

      sourceId:
        paymentId,

      context: {
        paymentId,
        invoiceId,
        contractId,
        studentId,
        studentName:
          studentRow?.name ||
          "Aluno",
        courseName,
        amount,
        paymentMethod,
        gateway,
        rejectionReason,
      },

      recipients:
        admins,

      connection,
    }
  );
}


/**
 * ============================================================
 * PAGAMENTO APROVADO
 * ============================================================
 *
 * O aluno recebe financial.payment.approved; todos os admins ativos
 * recebem admin.financial.payment.received no mesmo commit, para a
 * secretaria ver o Pix/boleto entrar (inclusive no gateway simulado).
 */
async function notifyPaymentApproved(
  db,
  connection,
  {
    paymentId,
    invoiceId,
    invoiceDescription,
    amount,
    studentId,
    courseId,
    courseName,
    paymentMethod,
  }
) {
  const [[studentRow]] = await connection.query(
    `SELECT name FROM students WHERE id = ? LIMIT 1`,
    [studentId]
  );
  const [[invoiceRow]] = await connection.query(
    `SELECT financial_contract_id FROM invoices WHERE id = ? LIMIT 1`,
    [invoiceId]
  );

  const studentName = studentRow?.name || "Aluno";
  const contractId = invoiceRow?.financial_contract_id || null;

  const recipient = await resolveStudentOwner(connection, { studentId });

  if (recipient) {
    await createNotificationEvent(db, {
      type: "financial.payment.approved",
      sourceType: "payment",
      sourceId: paymentId,
      courseId,
      context: {
        paymentId,
        invoiceId,
        invoiceDescription,
        amount,
        courseId,
        courseName,
      },
      recipients: [recipient],
      connection,
    });
  }

  const admins = await resolveAllActiveAdmins(connection);

  if (admins.length === 0) {
    return;
  }

  await createNotificationEvent(db, {
    type: "admin.financial.payment.received",
    sourceType: "payment",
    sourceId: paymentId,
    courseId,
    context: {
      paymentId,
      invoiceId,
      contractId,
      studentId,
      studentName,
      courseName,
      amount,
      paymentMethod: paymentMethod || null,
      invoiceDescription,
    },
    recipients: admins,
    connection,
  });
}


/**
 * ============================================================
 * PAGAMENTO REEMBOLSADO
 * ============================================================
 */
async function notifyPaymentRefunded(
  db,
  connection,
  {
    paymentId,
    invoiceId,
    invoiceDescription,
    amount,
    reason,
    studentId,
    courseId,
    courseName,
  }
) {

  const recipient =
    await resolveStudentOwner(
      connection,
      {
        studentId,
      }
    );


  if (!recipient) {
    return;
  }


  await createNotificationEvent(
    db,
    {
      type:
        "financial.payment.refunded",

      sourceType:
        "payment",

      sourceId:
        paymentId,

      courseId,

      context: {
        paymentId,
        invoiceId,
        invoiceDescription,
        amount,

        reason:
          reason ||
          null,

        courseId,
        courseName,
      },

      recipients: [
        recipient,
      ],

      connection,
    }
  );
}


/**
 * ============================================================
 * EXPORTS
 * ============================================================
 */
module.exports = {

  notifyInvoiceChanged,

  notifyInvoiceCancelled,

  /**
   * NOVO
   */
  notifyContractCancelled,

  notifyContractWithdrawn,

  notifyAdminPaymentRejected,

  notifyPaymentApproved,

  notifyPaymentRefunded,
};