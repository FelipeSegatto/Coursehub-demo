/**
 * Orquestrador da etapa 5 (submissão final) do checkout público --
 * transforma uma sessão verificada em aluno + contratante + contrato
 * + invoice + aceite, tudo em uma única transação, e só então tenta
 * iniciar o pagamento (fora da transação, já que a chamada de rede ao
 * gateway nunca pode acontecer com um lock de linha aberto).
 */
const { withTransaction } = require("../../utils/dbTransaction");
const { findSessionByToken, markConverted } = require("../../repositories/publicCheckoutSessions");
const {
  createStudentContractWithInitialInvoice,
  dispatchContractBillingNotification,
} = require("./contractCreationService");
const { startInvoicePayment } = require("./invoicePaymentService");
const {
  createServiceError,
  resolveOrCreateCheckoutStudent,
  assertContractingPartyAllowedForAge,
} = require("./publicCheckoutIdentityService");
const { createAccessToken } = require("../../repositories/invoicePaymentAccessTokens");
const { createSession } = require("../../repositories/invoicePaymentSessions");

function defaultDueDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);

  const pad = (n) => String(n).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * payload:
 *   checkoutToken (da URL, não do corpo)
 *   recipientMode: 'self' | 'other'
 *   studentCandidate: { name, email, birthDate, cpf, phone, address, gender }
 *   contractingPartyData: { partyType, name, documentType, documentNumber, email, phone,
 *                            relationshipType, billingAddressLine, billingAddressCity,
 *                            billingAddressState, billingAddressZipCode } -- só quando recipientMode==='other'
 *   acceptance: { termsVersion, privacyVersion }
 *   paymentMethod, cardToken?, cardPaymentMethodId?, cardInstallments?
 */
async function submitPublicCheckoutContract(
  db,
  {
    checkoutToken,
    recipientMode,
    studentCandidate,
    contractingPartyData,
    acceptance,
    paymentMethod,
    cardToken,
    cardPaymentMethodId,
    cardInstallments,
    ipAddress,
    userAgent,
  }
) {
  const session = await findSessionByToken(db.promise(), checkoutToken);

  if (!session) {
    throw createServiceError("Sessão de checkout inválida ou expirada.", 404);
  }

  if (session.status === "converted") {
    throw createServiceError("Esta sessão de checkout já foi concluída.", 409);
  }

  if (session.status !== "verified") {
    throw createServiceError("Confirme seu e-mail antes de concluir a contratação.", 409);
  }

  if (!studentCandidate?.birthDate) {
    throw createServiceError("Data de nascimento do aluno é obrigatória.", 400);
  }

  // Curso e plano SEMPRE vêm da sessão (definidos na etapa 1, já
  // revalidados ali contra o banco) -- nunca do corpo desta
  // requisição, mesmo que o cliente envie algo diferente.
  const courseId = session.course_id;
  const pricingPlanId = session.pricing_plan_id;

  const effectiveContractingPartyMode = recipientMode === "self" ? "self" : "new";

  assertContractingPartyAllowedForAge(studentCandidate.birthDate, effectiveContractingPartyMode);

  const created = await withTransaction(db, async (connection) => {
    const { studentId } = await resolveOrCreateCheckoutStudent(db, connection, studentCandidate);

    const contractResult = await createStudentContractWithInitialInvoice(
      db,
      {
        existingStudentId: studentId,
        contractingPartyMode: effectiveContractingPartyMode,
        contractingPartyData: effectiveContractingPartyMode === "new" ? contractingPartyData : undefined,
        courseId,
        pricingPlanId,
        billingData: { dueDate: defaultDueDate() },
        origin: "public_checkout",
        acceptance: {
          termsVersion: acceptance?.termsVersion,
          privacyVersion: acceptance?.privacyVersion,
          acceptanceMethod: "public_checkout",
          ipAddress,
          userAgent,
        },
      },
      null,
      { connection }
    );

    await markConverted(connection, session.id, contractResult.contractId);

    return contractResult;
  });

  // A partir daqui a transação já foi commitada -- a notificação de
  // cobrança só pode ser agendada agora que a escrita é durável.
  if (created.pendingBillingNotification) {
    await dispatchContractBillingNotification(db, created.pendingBillingNotification);
  }

  // O checkout público não passa pelo fluxo de troca de token da
  // invoice antes de pagar (diferente do link privado) -- para que a
  // tela de acompanhamento (/checkout/processando) e uma eventual
  // retomada consigam consultar/pagar esta invoice sem expor o id
  // dela em claro, estabelece aqui mesmo, no servidor, o mesmo par
  // token+sessão do link privado e devolve a sessão pronta (a rota
  // seta o cookie). O nome/e-mail do token vem do próprio pagador
  // recém-criado.
  const recipientName = recipientMode === "self" ? studentCandidate.name : contractingPartyData?.name;
  const recipientEmail = recipientMode === "self" ? studentCandidate.email : contractingPartyData?.email;

  const accessToken = await createAccessToken(db.promise(), {
    invoiceId: created.invoiceId,
    recipientName,
    recipientEmail,
  });

  const { rawSessionToken, expiresAt: sessionExpiresAt } = await createSession(db.promise(), {
    accessTokenId: accessToken.id,
    invoiceId: created.invoiceId,
  });

  try {
    const payment = await startInvoicePayment(db, {
      invoiceId: created.invoiceId,
      paymentMethod,
      cardToken,
      cardPaymentMethodId,
      cardInstallments,
      accessContext: { scope: "invoice", invoiceId: created.invoiceId },
    });

    return {
      contractId: created.contractId,
      invoiceId: created.invoiceId,
      payment,
      invoiceSessionToken: rawSessionToken,
      invoiceSessionExpiresAt: sessionExpiresAt,
    };
  } catch (paymentError) {
    // O contrato/invoice já existem e são reais -- nunca descartados
    // nem duplicados por uma falha aqui. O frontend oferece retomar o
    // pagamento na mesma invoice (ver CheckoutResult.jsx), usando a
    // mesma sessão já estabelecida acima.
    console.error(
      "[publicCheckoutService] contrato criado, mas falha ao iniciar pagamento:",
      paymentError
    );

    return {
      contractId: created.contractId,
      invoiceId: created.invoiceId,
      paymentInitError: true,
      invoiceSessionToken: rawSessionToken,
      invoiceSessionExpiresAt: sessionExpiresAt,
    };
  }
}

module.exports = {
  submitPublicCheckoutContract,
};
