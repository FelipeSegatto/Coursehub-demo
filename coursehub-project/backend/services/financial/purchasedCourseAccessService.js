/**
 * Depois do pagamento aprovado no checkout público da demo, devolve
 * o caminho para o comprador entrar no curso. A matrícula já existe;
 * quem ainda não tem senha recebe o link de ativação que a tela de
 * sucesso abre. O token só sai para quem segura o cookie da fatura.
 */
const { allowsSimulatedPayments } = require("../paymentGateway/demoGatewayPolicy");
const { getInvoicePaymentByAccessContext } = require("./invoicePaymentService");
const { createAccountActivationInvitation } = require("../auth/accountActivationService");

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

async function openPurchasedCourseAccess(db, { paymentId, accessContext }) {
  if (!allowsSimulatedPayments()) {
    throw createServiceError("O acesso ao curso segue pelo e-mail de ativação.", 403);
  }

  const payment = await getInvoicePaymentByAccessContext(db, { paymentId, accessContext });

  if (payment.status !== "approved") {
    throw createServiceError("O pagamento ainda não foi confirmado.", 409);
  }

  const invoiceId = Number(accessContext.invoiceId);

  const [rows] = await db.promise().query(
    `
      SELECT u.id AS user_id, u.status
      FROM invoices i
      INNER JOIN financial_contracts fc ON fc.id = i.financial_contract_id
      INNER JOIN students s ON s.id = fc.student_id
      INNER JOIN users u ON u.id = s.user_id
      WHERE i.id = ?
      LIMIT 1
    `,
    [invoiceId]
  );

  const buyer = rows[0];

  if (!buyer) {
    throw createServiceError("Não encontramos a matrícula desta compra.", 404);
  }

  if (buyer.status === "active") {
    return { accessPath: "/login" };
  }

  if (buyer.status !== "pending_activation") {
    throw createServiceError("Esta compra não pode liberar o acesso agora.", 409);
  }

  const invitation = await createAccountActivationInvitation(db, {
    userId: buyer.user_id,
    deliveryMethod: "manual_link",
    actorUserId: buyer.user_id,
  });

  const activationUrl = new URL(invitation.activationUrl);

  return {
    accessPath: `${activationUrl.pathname}${activationUrl.search}`,
  };
}

module.exports = {
  openPurchasedCourseAccess,
};
