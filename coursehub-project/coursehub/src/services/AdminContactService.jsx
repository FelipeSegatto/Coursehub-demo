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

export async function listContactRequests(params = {}) {
  const queryString = buildQueryString(params);

  return apiFetch(queryString ? `/api/admin/contacts?${queryString}` : "/api/admin/contacts");
}

export async function getContactRequestById(contactId) {
  return apiFetch(`/api/admin/contacts/${contactId}`);
}

export async function updateContactRequestStatus(contactId, status) {
  return apiFetch(`/api/admin/contacts/${contactId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
