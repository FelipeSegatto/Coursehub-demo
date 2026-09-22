/**
 * Compra autenticada de um segundo (ou N-ésimo) curso pelo próprio
 * aluno logado. studentId é SEMPRE derivado de req.auth.userId pela
 * rota -- nunca aceito do corpo da requisição.
 *
 * Diferente do wizard admin, aqui um contrato existente do mesmo
 * aluno para o mesmo curso não é tratado de forma binária
 * (cancelado vs. "qualquer outra coisa bloqueia"): o status decide o
 * que acontece --
 *   pending_payment / overdue -> retoma a invoice de ativação já
 *     existente (nunca cria um segundo contrato/invoice para a mesma
 *     tentativa de compra em aberto);
 *   active / completed -> o aluno já possui este curso, erro claro,
 *     nenhuma nova tentativa de pagamento é criada para um contrato
 *     já ativo;
 *   cancelled (ou nenhum contrato) -> segue o fluxo normal de criação.
 */
const { getStudentIdByUserId, createServiceError } = require("../classes/classAccessService");
const { createStudentContractWithInitialInvoice } = require("./contractCreationService");
const { startInvoicePayment } = require("./invoicePaymentService");

const RESUMABLE_STATUSES = new Set(["pending_payment", "overdue"]);
const BLOCKING_STATUSES = new Set(["active", "completed"]);

function defaultDueDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);

  const pad = (n) => String(n).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function findExistingContractForCourse(runner, { studentId, courseId }) {
  const [rows] = await runner.query(
    `
      SELECT id, status, activation_invoice_id
      FROM financial_contracts
      WHERE student_id = ? AND course_id = ?
      ORDER BY id DESC
      LIMIT 1
    `,
    [studentId, courseId]
  );

  return rows[0] || null;
}

async function purchaseAdditionalCourseAsAuthenticatedStudent(
  db,
  {
    userId,
    courseId,
    pricingPlanId,
    paymentMethod,
    cardToken,
    cardPaymentMethodId,
    cardInstallments,
    acceptance,
    ipAddress,
    userAgent,
  }
) {
  const normalizedCourseId = Number(courseId);

  if (!Number.isInteger(normalizedCourseId) || normalizedCourseId <= 0) {
    throw createServiceError("Curso é obrigatório e deve ser válido.", 400);
  }

  const studentId = await getStudentIdByUserId(db.promise(), userId);

  if (!studentId) {
    throw createServiceError("Aluno não encontrado.", 404);
  }

  const existingContract = await findExistingContractForCourse(db.promise(), {
    studentId,
    courseId: normalizedCourseId,
  });

  let contractId;
  let invoiceId;

  if (existingContract && BLOCKING_STATUSES.has(existingContract.status)) {
    throw createServiceError("Você já possui este curso.", 409);
  }

  if (existingContract && RESUMABLE_STATUSES.has(existingContract.status)) {
    if (!existingContract.activation_invoice_id) {
      throw createServiceError(
        "Este contrato não possui uma fatura de ativação em aberto. Entre em contato com a instituição.",
        409
      );
    }

    contractId = existingContract.id;
    invoiceId = existingContract.activation_invoice_id;
  }

  // Nenhum contrato, ou só um cancelado -- segue para criar um novo
  // (createStudentContractWithInitialInvoice's assertNoIncompatibleExistingContract
  // já ignora contratos cancelados, então não há conflito aqui).
  if (!invoiceId) {
    const created = await createStudentContractWithInitialInvoice(
      db,
      {
        existingStudentId: studentId,
        contractingPartyMode: "self",
        courseId: normalizedCourseId,
        pricingPlanId,
        billingData: { dueDate: defaultDueDate() },
        origin: "authenticated_checkout",
        acceptance: acceptance
          ? {
              acceptedByUserId: userId,
              termsVersion: acceptance.termsVersion,
              privacyVersion: acceptance.privacyVersion,
              acceptanceMethod: "authenticated_checkout",
              ipAddress,
              userAgent,
            }
          : undefined,
      },
      userId
    );

    contractId = created.contractId;
    invoiceId = created.invoiceId;
  }

  const payment = await startInvoicePayment(db, {
    invoiceId,
    paymentMethod,
    cardToken,
    cardPaymentMethodId,
    cardInstallments,
    accessContext: { scope: "student", studentId, userId },
  });

  return { contractId, invoiceId, payment };
}

module.exports = {
  purchaseAdditionalCourseAsAuthenticatedStudent,
};
