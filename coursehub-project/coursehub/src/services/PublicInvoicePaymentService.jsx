import { apiFetch } from "./APIService";

const BASE = "/api/public/invoice-payment";

/** Troca o token bruto do link (só enviado aqui, uma vez) por uma sessão curta via cookie HTTP-only. */
export async function exchangeInvoicePaymentToken(token) {
  return apiFetch(`${BASE}/session`, {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

/** Leitura mínima autorizada pela sessão -- nunca por um id enviado pelo frontend. */
export async function getInvoicePaymentSnapshot() {
  return apiFetch(`${BASE}/me`);
}

export async function createPublicInvoicePayment(paymentMethod, extra = {}) {
  return apiFetch(`${BASE}/payments`, {
    method: "POST",
    body: JSON.stringify({ paymentMethod, ...extra }),
  });
}

export async function getPublicInvoicePayment(paymentId) {
  return apiFetch(`${BASE}/payments/${paymentId}`);
}

/** "Não encontrou seu link?" -- sempre resolve com a mesma mensagem genérica. */
export async function requestInvoicePaymentLinkByEmail(email) {
  return apiFetch(`${BASE}/request-link`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}
