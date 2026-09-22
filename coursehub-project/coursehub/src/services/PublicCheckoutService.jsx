import { apiFetch } from "./APIService";

const BASE = "/api/public/checkout";

export async function createCheckoutSession({ courseId, pricingPlanId, email }) {
  return apiFetch(`${BASE}/sessions`, {
    method: "POST",
    body: JSON.stringify({ courseId, pricingPlanId, email }),
  });
}

export async function getCheckoutSession(checkoutToken) {
  return apiFetch(`${BASE}/sessions/${checkoutToken}`);
}

export async function validateCheckoutEmailToken(token) {
  return apiFetch(`${BASE}/verify-email/validate?token=${encodeURIComponent(token || "")}`);
}

export async function verifyCheckoutEmail(token) {
  return apiFetch(`${BASE}/verify-email`, {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function submitCheckoutContract(checkoutToken, payload) {
  return apiFetch(`${BASE}/sessions/${checkoutToken}/contract`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
