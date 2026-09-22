const simulatedGateway = require("./simulatedGateway");
const mercadoPagoGateway = require("./mercadoPagoGateway");

const GATEWAYS = {
  simulated: simulatedGateway,
  mercado_pago: mercadoPagoGateway,
};

/**
 * Único lugar onde o restante da aplicação pergunta "qual gateway de
 * pagamento está ativo" -- tudo mais (studentPaymentService,
 * paymentProcessingService, paymentRefundService, a rota de webhook)
 * chama isso em vez de decidir a partir de
 * process.env.PAYMENT_GATEWAY diretamente. Reaproveitado também para
 * o caso de "resolver pelo nome" (reembolsar um pagamento criado sob
 * qualquer que fosse o gateway ativo na época, mesmo que
 * PAYMENT_GATEWAY tenha mudado desde então) -- ver
 * resolveGatewayByName.
 */
function getPaymentGatewayName() {
  return process.env.PAYMENT_GATEWAY || "simulated";
}

function resolveGatewayByName(name) {
  const gateway = GATEWAYS[name];

  if (!gateway) {
    throw new Error(`Gateway de pagamento desconhecido: "${name}".`);
  }

  return gateway;
}

/** Retorna o adaptador do PAYMENT_GATEWAY configurado atualmente. */
function getPaymentGateway() {
  return resolveGatewayByName(getPaymentGatewayName());
}

module.exports = {
  getPaymentGatewayName,
  getPaymentGateway,
  resolveGatewayByName,
};
