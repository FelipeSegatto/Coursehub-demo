/**
 * Configuração central para os fluxos de checkout público, autenticado
 * e pagamento privado de invoice. Não é migration, não toca banco --
 * só constantes derivadas de env com fallback seguro, seguindo o
 * mesmo idioma de getTtlMinutes() em
 * repositories/accountActivationTokens.js, centralizadas aqui porque
 * vários services novos compartilham os mesmos valores.
 */

function positiveIntFromEnv(envVarName, fallback) {
  const configured = Number(process.env[envVarName]);

  return Number.isFinite(configured) && configured > 0 ? configured : fallback;
}

/**
 * Idade mínima (anos) para um aluno ser seu próprio contratante
 * (contractingPartyMode === 'self') no checkout público. Abaixo disso,
 * um responsável/contratante terceiro é obrigatório. Nunca espalhar o
 * número 18 pelo código -- sempre importar daqui.
 */
const MIN_SELF_CONTRACTING_AGE = positiveIntFromEnv("MIN_SELF_CONTRACTING_AGE", 18);

/**
 * TTL da sessão de checkout público (curso/plano/e-mail), em minutos.
 * Cobre também o prazo para confirmar o e-mail -- uma única validade
 * para a sessão inteira, não dois prazos independentes.
 */
const PUBLIC_CHECKOUT_SESSION_TTL_MINUTES = positiveIntFromEnv(
  "PUBLIC_CHECKOUT_SESSION_TTL_MINUTES",
  30
);

/** TTL do link privado de pagamento de invoice, em dias. */
const INVOICE_PAYMENT_LINK_TTL_DAYS = positiveIntFromEnv("INVOICE_PAYMENT_LINK_TTL_DAYS", 30);

/** TTL da sessão curta (cookie) trocada a partir do link privado de invoice, em minutos. */
const INVOICE_PAYMENT_SESSION_TTL_MINUTES = positiveIntFromEnv(
  "INVOICE_PAYMENT_SESSION_TTL_MINUTES",
  45
);

module.exports = {
  MIN_SELF_CONTRACTING_AGE,
  PUBLIC_CHECKOUT_SESSION_TTL_MINUTES,
  INVOICE_PAYMENT_LINK_TTL_DAYS,
  INVOICE_PAYMENT_SESSION_TTL_MINUTES,
};
