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

export async function listContractingParties(params = {}) {
  const queryString = buildQueryString(params);

  return apiFetch(
    queryString ? `/api/admin/contracting-parties?${queryString}` : "/api/admin/contracting-parties"
  );
}

export async function searchContractingParties(term) {
  if (!term?.trim()) {
    return { data: [] };
  }

  return apiFetch(`/api/admin/contracting-parties/search?term=${encodeURIComponent(term)}`);
}

export async function getContractingPartyById(partyId) {
  return apiFetch(`/api/admin/contracting-parties/${partyId}`);
}

export async function createContractingParty(payload) {
  return apiFetch("/api/admin/contracting-parties", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateContractingParty(partyId, payload) {
  return apiFetch(`/api/admin/contracting-parties/${partyId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function updateContractingPartyContact(partyId, payload) {
  return apiFetch(`/api/admin/contracting-parties/${partyId}/contact`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function updateContractingPartyStatus(partyId, status) {
  return apiFetch(`/api/admin/contracting-parties/${partyId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
