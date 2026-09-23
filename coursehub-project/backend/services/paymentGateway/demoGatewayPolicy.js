/**
 * A demo publicada sobe com NODE_ENV=production e PAYMENT_GATEWAY=simulated.
 * Sem DEMO_ALLOW_SIMULATED_GATEWAY=true, produção continua recusando o gateway falso.
 */
function allowsSimulatedPayments() {
  if ((process.env.PAYMENT_GATEWAY || "simulated") !== "simulated") {
    return false;
  }

  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const flag = String(process.env.DEMO_ALLOW_SIMULATED_GATEWAY || "").toLowerCase();

  return flag === "true" || flag === "1";
}

module.exports = {
  allowsSimulatedPayments,
};
