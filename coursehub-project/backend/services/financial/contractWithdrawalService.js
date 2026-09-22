/**
 * Registro de desistência -- encerramento antecipado de um contrato
 * JÁ ATIVO (status active/overdue, ou seja, com matrícula já criada),
 * coordenando contrato, matrícula, faturas e auditoria numa única
 * transação. Diferente de contractCancellationService.js (que cobre
 * um contrato pending_payment, ANTES da matrícula existir): aqui a
 * matrícula é sempre encerrada junto, nunca deixada ativa depois que
 * o contrato comercial que a sustenta é cancelado.
 *
 * Nunca apaga histórico: notas, frequência, submissões, progresso,
 * documentos e aceite contratual continuam intactos -- só
 * financial_contracts.status e enrollments.status mudam. Nunca gera
 * reembolso automaticamente (faturas pagas/reembolsadas nunca são
 * tocadas). Faturas vencidas seguem a política escolhida pelo admin
 * (keep/cancel); faturas futuras ainda não pagas são sempre
 * canceladas, já que não faz sentido continuar cobrando por um curso
 * que o aluno não vai mais cursar.
 */
const { withTransaction } = require("../../utils/dbTransaction");
const { createFinancialEvent } = require("./financialEventService");
const { cancelInvoiceWithConnection } = require("./invoiceCancellationService");
const { notifyContractWithdrawn } = require("./financialNotificationService");

const OVERDUE_INVOICE_ACTIONS = ["keep", "cancel"];
const WITHDRAWABLE_CONTRACT_STATUSES = ["active", "overdue"];

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

function normalizeMoney(value) {
  return value === null || value === undefined ? 0 : Number(value);
}

function normalizeContractId(contractId) {
  const normalized = Number(contractId);

  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw createServiceError("ID do contrato inválido.", 400);
  }

  return normalized;
}

/**
 * Mensagem de bloqueio explicando por que um contrato/matrícula não
 * pode receber uma desistência agora -- usada tanto no endpoint de
 * impacto (só informativo) quanto, com mensagens equivalentes, nas
 * validações que de fato impedem a operação em registerContractWithdrawal.
 */
function describeContractBlocker(contractStatus) {
  if (contractStatus === "pending_payment") {
    return "O contrato ainda não foi ativado (aguardando pagamento). Utilize o cancelamento de contratação, não a desistência.";
  }

  if (contractStatus === "completed") {
    return "Este contrato já foi concluído e não pode receber uma desistência.";
  }

  if (contractStatus === "cancelled") {
    return "Este contrato já está cancelado.";
  }

  return null;
}

function describeEnrollmentBlocker(enrollmentStatus) {
  if (enrollmentStatus === "completed") {
    return "A matrícula já está concluída.";
  }

  if (enrollmentStatus === "cancelled") {
    return "A matrícula já está cancelada.";
  }

  if (enrollmentStatus === "withdrawn") {
    return "A desistência deste aluno já foi registrada.";
  }

  return null;
}

/**
 * GET /api/admin/financial/contracts/:contractId/withdrawal-impact --
 * consulta somente leitura, usada pelo modal do admin antes de
 * confirmar. Nunca bloqueia linhas (FOR UPDATE só acontece na
 * confirmação real, dentro da transação).
 */
async function getContractWithdrawalImpact(db, contractId) {
  const normalizedContractId = normalizeContractId(contractId);

  const [contractRows] = await db.promise().query(
    `
      SELECT
        fc.id, fc.status, fc.enrollment_id, fc.student_id, fc.course_id,
        fc.contracting_party_name, fc.contracting_party_document,
        fc.contracting_party_email, fc.contracting_party_phone,
        s.name AS student_name,
        co.name AS course_name,
        e.status AS enrollment_status
      FROM financial_contracts fc
      LEFT JOIN students s ON s.id = fc.student_id
      LEFT JOIN courses co ON co.id = fc.course_id
      LEFT JOIN enrollments e ON e.id = fc.enrollment_id
      WHERE fc.id = ?
      LIMIT 1
    `,
    [normalizedContractId]
  );

  if (contractRows.length === 0) {
    throw createServiceError("Contrato financeiro não encontrado.", 404);
  }

  const contract = contractRows[0];

  const [invoiceSummaryRows] = await db.promise().query(
    `
      SELECT
        COUNT(CASE WHEN status = 'paid' THEN 1 END) AS paid_count,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS paid_amount,

        COUNT(CASE WHEN status IN ('pending', 'processing') THEN 1 END) AS open_count,
        COALESCE(SUM(CASE WHEN status IN ('pending', 'processing') THEN amount ELSE 0 END), 0) AS open_amount,

        COUNT(CASE WHEN status = 'overdue' THEN 1 END) AS overdue_count,
        COALESCE(SUM(CASE WHEN status = 'overdue' THEN amount ELSE 0 END), 0) AS overdue_amount,

        COUNT(CASE WHEN status = 'refunded' THEN 1 END) AS refunded_count,
        COALESCE(SUM(CASE WHEN status = 'refunded' THEN amount ELSE 0 END), 0) AS refunded_amount
      FROM invoices
      WHERE financial_contract_id = ?
    `,
    [normalizedContractId]
  );

  const invoiceSummary = invoiceSummaryRows[0] || {};

  const blockers = [];

  const contractBlocker = describeContractBlocker(contract.status);
  if (contractBlocker) blockers.push(contractBlocker);

  if (!contract.enrollment_id) {
    blockers.push("Este contrato não possui matrícula vinculada.");
  } else {
    const enrollmentBlocker = describeEnrollmentBlocker(contract.enrollment_status);
    if (enrollmentBlocker) blockers.push(enrollmentBlocker);
  }

  return {
    contract: { id: contract.id, status: contract.status },

    enrollment: contract.enrollment_id
      ? { id: contract.enrollment_id, status: contract.enrollment_status }
      : null,

    student: contract.student_id
      ? { id: contract.student_id, name: contract.student_name }
      : null,

    course: contract.course_id
      ? { id: contract.course_id, name: contract.course_name }
      : null,

    contractingParty: {
      name: contract.contracting_party_name,
      document: contract.contracting_party_document,
      email: contract.contracting_party_email,
      phone: contract.contracting_party_phone,
    },

    totals: {
      paidAmount: normalizeMoney(invoiceSummary.paid_amount),
      paidCount: Number(invoiceSummary.paid_count || 0),

      openAmount: normalizeMoney(invoiceSummary.open_amount),
      openCount: Number(invoiceSummary.open_count || 0),

      overdueAmount: normalizeMoney(invoiceSummary.overdue_amount),
      overdueCount: Number(invoiceSummary.overdue_count || 0),

      refundedAmount: normalizeMoney(invoiceSummary.refunded_amount),
      refundedCount: Number(invoiceSummary.refunded_count || 0),
    },

    isWithdrawalAllowed: blockers.length === 0,
    blockers,
  };
}

/**
 * POST /api/admin/financial/contracts/:contractId/withdrawal --
 * confirmação real. Tudo roda em UMA transação, com o contrato e a
 * matrícula travados via FOR UPDATE -- uma segunda desistência
 * concorrente para o mesmo contrato bloqueia nesta linha até a
 * primeira commitar, e então encontra status='cancelled' e recebe um
 * 409 coerente (nenhum evento duplicado é criado).
 */
async function registerContractWithdrawal(
  db,
  contractId,
  { reason, notes, overdueInvoiceAction, actorUserId }
) {
  const normalizedContractId = normalizeContractId(contractId);

  const trimmedReason = typeof reason === "string" ? reason.trim() : "";

  if (!trimmedReason) {
    throw createServiceError("O motivo da desistência é obrigatório.", 400);
  }

  if (!OVERDUE_INVOICE_ACTIONS.includes(overdueInvoiceAction)) {
    throw createServiceError(
      'O tratamento das cobranças vencidas deve ser "keep" ou "cancel".',
      400
    );
  }

  if (!actorUserId) {
    throw createServiceError("Administrador responsável é obrigatório.", 401);
  }

  const trimmedNotes = typeof notes === "string" && notes.trim() ? notes.trim() : null;

  return withTransaction(db, async (connection) => {
    const [contractRows] = await connection.query(
      `
        SELECT fc.id, fc.status, fc.enrollment_id, fc.student_id, fc.course_id, co.name AS course_name
        FROM financial_contracts fc
        LEFT JOIN courses co ON co.id = fc.course_id
        WHERE fc.id = ?
        LIMIT 1
        FOR UPDATE
      `,
      [normalizedContractId]
    );

    if (contractRows.length === 0) {
      throw createServiceError("Contrato financeiro não encontrado.", 404);
    }

    const contract = contractRows[0];

    if (!WITHDRAWABLE_CONTRACT_STATUSES.includes(contract.status)) {
      const blocker = describeContractBlocker(contract.status);

      throw createServiceError(
        blocker || `Este contrato não pode receber uma desistência no status "${contract.status}".`,
        409
      );
    }

    if (!contract.enrollment_id) {
      throw createServiceError("Este contrato não possui matrícula vinculada.", 409);
    }

    const [enrollmentRows] = await connection.query(
      `SELECT id, status FROM enrollments WHERE id = ? LIMIT 1 FOR UPDATE`,
      [contract.enrollment_id]
    );

    if (enrollmentRows.length === 0) {
      throw createServiceError("Matrícula não encontrada.", 404);
    }

    const enrollment = enrollmentRows[0];

    const enrollmentBlocker = describeEnrollmentBlocker(enrollment.status);

    if (enrollmentBlocker) {
      throw createServiceError(enrollmentBlocker, 409);
    }

    // Faturas travadas ANTES de qualquer mudança -- o snapshot de
    // totais do evento de auditoria reflete o estado real anterior à
    // desistência, e as linhas já ficam bloqueadas para os
    // cancelamentos que seguem.
    const [invoiceRows] = await connection.query(
      `SELECT id, status, amount FROM invoices WHERE financial_contract_id = ? FOR UPDATE`,
      [normalizedContractId]
    );

    const previousTotals = invoiceRows.reduce(
      (accumulator, invoice) => {
        const amount = normalizeMoney(invoice.amount);

        if (invoice.status === "paid") {
          accumulator.paidAmount += amount;
          accumulator.paidCount += 1;
        } else if (invoice.status === "pending" || invoice.status === "processing") {
          accumulator.openAmount += amount;
          accumulator.openCount += 1;
        } else if (invoice.status === "overdue") {
          accumulator.overdueAmount += amount;
          accumulator.overdueCount += 1;
        } else if (invoice.status === "refunded") {
          accumulator.refundedAmount += amount;
          accumulator.refundedCount += 1;
        }

        return accumulator;
      },
      { paidAmount: 0, paidCount: 0, openAmount: 0, openCount: 0, overdueAmount: 0, overdueCount: 0, refundedAmount: 0, refundedCount: 0 }
    );

    // O contrato é marcado cancelled ANTES de cancelar as faturas --
    // cancelInvoiceWithConnection chama recalculateFinancialContractStatus,
    // que já sai em no-op para um contrato 'cancelled' (ver
    // contractFinancialService.js), então a ordem aqui garante que o
    // status final do contrato nunca é recalculado a partir das
    // faturas, e sim exatamente o que a desistência determina.
    // cancellation_reason = 'student_withdrawal' é o valor estrutural
    // que distingue esta desistência de um cancelamento administrativo
    // por outro motivo (contractCancellationService.js nunca preenche
    // essa coluna).
    await connection.query(
      `UPDATE financial_contracts SET status = 'cancelled', cancellation_reason = 'student_withdrawal', cancelled_at = NOW(), updated_at = NOW() WHERE id = ?`,
      [normalizedContractId]
    );

    // 'withdrawn', não 'cancelled' -- distingue "o aluno desistiu" de
    // um cancelamento administrativo de matrícula por outro motivo
    // (ver adminEnrollmentService.js#updateEnrollmentStatus, que ainda
    // usa 'cancelled' genérico). O gate de acesso acadêmico
    // (classAccessService.js#getActiveEnrollmentForStudent) já exige
    // status = 'active', então isso já encerra o acesso ao curso sem
    // nenhuma mudança adicional de query.
    await connection.query(
      `UPDATE enrollments SET status = 'withdrawn', updated_at = NOW() WHERE id = ?`,
      [contract.enrollment_id]
    );

    const invoiceReason = `Contrato encerrado por desistência (motivo: ${trimmedReason}).`;

    const cancelledInvoiceIds = [];

    // Faturas futuras ainda não pagas: sempre canceladas, não faz
    // sentido continuar cobrando por um curso que o aluno não vai
    // mais cursar.
    const invoicesToCancel = invoiceRows.filter((invoice) => {
      if (invoice.status === "pending" || invoice.status === "processing") {
        return true;
      }

      // Faturas vencidas seguem a política escolhida pelo admin.
      return invoice.status === "overdue" && overdueInvoiceAction === "cancel";
    });

    for (const invoice of invoicesToCancel) {
      await cancelInvoiceWithConnection(db, connection, {
        invoiceId: invoice.id,
        reason: invoiceReason,
        actorUserId,
      });

      cancelledInvoiceIds.push(invoice.id);
    }

    await createFinancialEvent(connection, {
      financialContractId: normalizedContractId,
      enrollmentId: contract.enrollment_id,
      eventType: "contract_withdrawal_registered",
      source: "admin",
      actorUserId,
      previousValue: {
        contractStatus: contract.status,
        enrollmentStatus: enrollment.status,
        totals: previousTotals,
      },
      newValue: {
        contractStatus: "cancelled",
        cancellationReason: "student_withdrawal",
        enrollmentStatus: "withdrawn",
        studentId: contract.student_id,
        cancelledInvoiceIds,
        overdueInvoiceAction,
        notes: trimmedNotes,
      },
      reason: trimmedReason,
    });

    await notifyContractWithdrawn(db, connection, {
      contractId: normalizedContractId,
      studentId: contract.student_id,
      courseId: contract.course_id,
      courseName: contract.course_name,
      reason: trimmedReason,
      actorUserId,
    });

    return {
      contractId: normalizedContractId,
      enrollmentId: contract.enrollment_id,
      status: "cancelled",
      cancellationReason: "student_withdrawal",
      enrollmentStatus: "withdrawn",
      cancelledInvoiceIds,
      overdueInvoiceAction,
    };
  });
}

module.exports = {
  createServiceError,
  getContractWithdrawalImpact,
  registerContractWithdrawal,
};
