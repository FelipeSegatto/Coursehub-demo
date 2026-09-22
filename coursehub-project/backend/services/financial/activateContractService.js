/**
 * activateContractFromPaidInvoice -- a fatura de ativação de um
 * contrato foi paga: cria (ou reaproveita) a matrícula, ativa o
 * contrato, registra os eventos financeiros. Chamado do MESMO ponto
 * central por três origens diferentes (webhook do gateway, pagamento
 * manual pelo admin, confirmação manual pelo admin) -- nenhuma delas
 * duplica esta lógica.
 *
 * Puramente transacional: nunca dispara e-mail/notificação aqui
 * dentro. Quem chama decide quando é seguro chamar
 * dispatchActivationNotifications (só depois que a transação que
 * envolve esta chamada realmente commitou -- ver
 * paymentProcessingService.js / paymentService.js).
 *
 * Aceita uma `connection` já aberta (para rodar dentro da transação
 * do chamador, ex: junto da própria baixa do pagamento) ou abre e
 * gerencia a sua própria quando nenhuma é passada.
 */
const { createFinancialEvent } = require("./financialEventService");
const {
  dispatchActivationInvitationEmail,
  dispatchAlreadyActiveNotice,
} = require("../auth/accountActivationService");
const { createNotificationEvent } = require("../notifications/notificationService");
const { resolveAllActiveAdmins } = require("../notifications/notificationRecipientResolvers");

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

async function activateContractFromPaidInvoice(db, invoiceId, options = {}) {
  const { connection: externalConnection, source = "system" } = options;

  const normalizedInvoiceId = Number(invoiceId);

  if (!Number.isInteger(normalizedInvoiceId) || normalizedInvoiceId <= 0) {
    throw createServiceError("ID da fatura inválido.", 400);
  }

  const ownsConnection = !externalConnection;
  const connection = externalConnection || (await db.promise().getConnection());

  try {
    if (ownsConnection) {
      await connection.beginTransaction();
    }

    const [invoiceRows] = await connection.query(
      `SELECT id, financial_contract_id, status FROM invoices WHERE id = ? LIMIT 1 FOR UPDATE`,
      [normalizedInvoiceId]
    );

    if (invoiceRows.length === 0) {
      throw createServiceError("Fatura não encontrada.", 404);
    }

    const invoice = invoiceRows[0];

    const [contractRows] = await connection.query(
      `
        SELECT id, student_id, course_id, activation_invoice_id, enrollment_id, status,
               created_by_user_id, origin
        FROM financial_contracts
        WHERE id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [invoice.financial_contract_id]
    );

    if (contractRows.length === 0) {
      throw createServiceError("Contrato não encontrado.", 404);
    }

    const contract = contractRows[0];

    // Idempotência: chamada repetida para um contrato que já tem
    // matrícula nunca duplica nada -- devolve o resultado existente.
    if (contract.enrollment_id) {
      if (ownsConnection) {
        await connection.commit();
      }

      return {
        activated: false,
        alreadyActivated: true,
        contractId: contract.id,
        enrollmentId: contract.enrollment_id,
        invoiceId: normalizedInvoiceId,
      };
    }

    if (contract.status === "cancelled") {
      throw createServiceError(
        "Este contrato está cancelado e não pode ser ativado.",
        409
      );
    }

    if (invoice.status !== "paid") {
      throw createServiceError("A fatura ainda não está paga.", 409);
    }

    if (Number(contract.activation_invoice_id) !== normalizedInvoiceId) {
      // Fatura paga não é a fatura de ativação do contrato (ex: uma
      // parcela futura paga fora de ordem) -- nada a ativar aqui.
      if (ownsConnection) {
        await connection.commit();
      }

      return {
        activated: false,
        alreadyActivated: false,
        reason: "not_activation_invoice",
        contractId: contract.id,
        invoiceId: normalizedInvoiceId,
      };
    }

    const [existingEnrollmentRows] = await connection.query(
      `
        SELECT id, status FROM enrollments
        WHERE student_id = ? AND course_id = ?
          AND status NOT IN ('cancelled', 'withdrawn')
        LIMIT 1
        FOR UPDATE
      `,
      [contract.student_id, contract.course_id]
    );

    let enrollmentId;
    let enrollmentCreated = false;

    if (existingEnrollmentRows.length > 0) {
      if (existingEnrollmentRows[0].status === "completed") {
        throw createServiceError(
          "Este aluno já concluiu este curso e não pode se rematricular.",
          409
        );
      }

      enrollmentId = existingEnrollmentRows[0].id;
    } else {
      const [enrollmentResult] = await connection.query(
        `
          INSERT INTO enrollments
            (student_id, course_id, class_id, status, enrolled_at, origin,
             created_by_user_id, activated_at, created_at, updated_at)
          VALUES (?, ?, NULL, 'active', NOW(), 'commercial', ?, NOW(), NOW(), NOW())
        `,
        [contract.student_id, contract.course_id, contract.created_by_user_id]
      );

      enrollmentId = enrollmentResult.insertId;
      enrollmentCreated = true;
    }

    await connection.query(
      `
        UPDATE financial_contracts
        SET enrollment_id = ?, status = 'active', activated_at = NOW(), updated_at = NOW()
        WHERE id = ?
      `,
      [enrollmentId, contract.id]
    );

    await createFinancialEvent(connection, {
      financialContractId: contract.id,
      invoiceId: normalizedInvoiceId,
      eventType: "invoice_payment_confirmed",
      source,
    });

    await createFinancialEvent(connection, {
      financialContractId: contract.id,
      invoiceId: normalizedInvoiceId,
      enrollmentId,
      eventType: "contract_activated",
      source,
    });

    if (enrollmentCreated) {
      await createFinancialEvent(connection, {
        financialContractId: contract.id,
        enrollmentId,
        eventType: "enrollment_created",
        source,
      });
    }

    if (ownsConnection) {
      await connection.commit();
    }

    return {
      activated: true,
      alreadyActivated: false,
      contractId: contract.id,
      invoiceId: normalizedInvoiceId,
      enrollmentId,
      enrollmentCreated,
      studentId: contract.student_id,
      courseId: contract.course_id,
      origin: contract.origin,
    };
  } catch (error) {
    if (ownsConnection) {
      await connection.rollback();
    }

    throw error;
  } finally {
    if (ownsConnection) {
      connection.release();
    }
  }
}

/**
 * Efeitos pós-commit da ativação -- SÓ deve ser chamado depois que a
 * transação que envolveu activateContractFromPaidInvoice de fato
 * commitou (a própria, quando ela gerencia sua transação, ou a do
 * chamador, quando uma `connection` externa foi passada). Nunca
 * chamado quando `activated` é false (nada mudou) ou quando
 * `alreadyActivated` é true (já foi despachado na primeira vez --
 * repetir aqui duplicaria o convite/aviso).
 */
async function dispatchActivationNotifications(db, activationResult) {
  if (!activationResult?.activated) {
    return;
  }

  const [studentRows] = await db
    .promise()
    .query(`SELECT user_id, name FROM students WHERE id = ? LIMIT 1`, [
      activationResult.studentId,
    ]);

  if (studentRows.length === 0) {
    return;
  }

  const { user_id: userId, name: studentName } = studentRows[0];

  const [userRows] = await db
    .promise()
    .query(`SELECT status, email FROM users WHERE id = ? LIMIT 1`, [userId]);

  if (userRows.length === 0) {
    return;
  }

  const user = userRows[0];

  try {
    if (user.status === "pending_activation") {
      await dispatchActivationInvitationEmail(db, {
        userId,
        email: user.email,
        studentName,
        courseId: activationResult.courseId,
        enrollmentId: activationResult.enrollmentId,
      });
    } else if (user.status === "active") {
      await dispatchAlreadyActiveNotice(db, {
        userId,
        email: user.email,
        courseId: activationResult.courseId,
        invoiceId: activationResult.invoiceId,
      });
    }
    // 'blocked' users receive neither -- the enrollment/contract are
    // still activated (financial state must not depend on account
    // status), only the notification is withheld.
  } catch (notificationError) {
    console.error(
      "[activateContractService] falha ao agendar notificação de ativação:",
      notificationError
    );
  }
}

/**
 * Notificação administrativa de "nova matrícula" -- ramifica por
 * `origin` para escolher UM tipo, nunca os dois: contratos vindos de
 * checkout (public_checkout/authenticated_checkout) geram
 * admin.checkout.completed; qualquer outro (admin/migration) gera
 * admin.enrollment.created. Chamado do único ponto de convergência
 * (activateContractFromPaidInvoice, quando `activated` é true) e
 * também pelos caminhos manuais que nunca passam por essa função
 * (adminEnrollmentService.createEnrollment,
 * adminManualEnrollmentService's scholarship/migration), sempre com
 * origin != checkout nesses casos -- nunca duas notificações para a
 * mesma matrícula. Assim como dispatchActivationNotifications, roda
 * depois do commit e nunca desfaz a matrícula se falhar.
 */
async function dispatchAdminEnrollmentNotification(
  db,
  { enrollmentId, contractId = null, invoiceId = null, studentId, courseId, origin, paymentId = null, amount = null }
) {
  try {
    const admins = await resolveAllActiveAdmins(db.promise());

    if (admins.length === 0) {
      return;
    }

    const [[studentRow]] = await db.promise().query(`SELECT name FROM students WHERE id = ? LIMIT 1`, [studentId]);
    const [[courseRow]] = await db.promise().query(`SELECT name FROM courses WHERE id = ? LIMIT 1`, [courseId]);

    const isCheckout = origin === "public_checkout" || origin === "authenticated_checkout";

    await createNotificationEvent(db, {
      type: isCheckout ? "admin.checkout.completed" : "admin.enrollment.created",
      sourceType: "enrollment",
      sourceId: enrollmentId,
      // Deliberadamente NÃO setado no nível superior (notifications.course_id
      // tem FK RESTRICT para courses): esta notificação é lida por
      // admins que ficam ativos indefinidamente, então travaria a
      // exclusão de qualquer curso de teste/descontinuado enquanto a
      // notificação existir. courseId/courseName já estão no context
      // abaixo, que é tudo que buildTitle/buildMessage/buildActionPath
      // precisam.
      context: {
        enrollmentId,
        studentId,
        studentName: studentRow?.name || "Aluno",
        courseId,
        courseName: courseRow?.name || "Curso",
        contractId,
        invoiceId,
        paymentId,
        amount,
        origin,
      },
      recipients: admins,
    });
  } catch (notificationError) {
    console.error("[activateContractService] falha ao notificar admins sobre a nova matrícula:", notificationError);
  }
}

module.exports = {
  createServiceError,
  activateContractFromPaidInvoice,
  dispatchActivationNotifications,
  dispatchAdminEnrollmentNotification,
};
