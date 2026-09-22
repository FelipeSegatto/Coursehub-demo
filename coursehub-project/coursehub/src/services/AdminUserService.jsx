import { apiFetch } from "./APIService";

function buildQueryString(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    const shouldIgnore = value === undefined || value === null || value === "";

    if (!shouldIgnore) {
      query.append(key, String(value));
    }
  });

  return query.toString();
}

export async function listUsers(params = {}) {
  const queryString = buildQueryString(params);

  return apiFetch(
    queryString ? `/api/admin/users?${queryString}` : "/api/admin/users"
  );
}

export async function getUserById(userId) {
  return apiFetch(`/api/admin/users/${userId}`);
}

/** Cria um usuário do papel informado em payload.role (admin, teacher ou student). */
export async function createUser(payload) {
  return apiFetch("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateUser(userId, payload) {
  return apiFetch(`/api/admin/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function updateUserStatus(userId, status) {
  return apiFetch(`/api/admin/users/${userId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function sendPasswordReset(userId) {
  return apiFetch(`/api/admin/users/${userId}/send-password-reset`, {
    method: "POST",
  });
}

export async function softDeleteUser(userId) {
  return apiFetch(`/api/admin/users/${userId}`, {
    method: "DELETE",
  });
}
