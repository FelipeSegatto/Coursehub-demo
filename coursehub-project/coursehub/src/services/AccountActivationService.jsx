import { apiFetch } from "./APIService";

export async function validateActivationToken(token) {
  return apiFetch(`/api/auth/account-activation/validate?token=${encodeURIComponent(token || "")}`);
}

export async function activateAccount({ token, newPassword, confirmPassword }) {
  return apiFetch("/api/auth/account-activation", {
    method: "POST",
    body: JSON.stringify({ token, newPassword, confirmPassword }),
  });
}

/**
 * deliveryMethod: "email" | "manual_link". A resposta de "manual_link"
 * traz o link bruto UMA ÚNICA VEZ -- o chamador nunca deve persistir
 * esse valor (nem em state global, nem em localStorage/sessionStorage).
 */
export async function createAccountActivationInvitation(userId, deliveryMethod) {
  return apiFetch(`/api/admin/users/${userId}/account-activation-invitations`, {
    method: "POST",
    body: JSON.stringify({ deliveryMethod }),
  });
}
