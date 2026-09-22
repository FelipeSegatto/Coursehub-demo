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

export async function listMaterials(params = {}) {
  const queryString = buildQueryString(params);

  return apiFetch(
    queryString ? `/api/admin/materials?${queryString}` : "/api/admin/materials"
  );
}

export async function getMaterialById(contentId) {
  return apiFetch(`/api/admin/materials/${contentId}`);
}

export async function getScopeImpact(contentId, newClassId) {
  const queryString = buildQueryString({ newClassId });

  return apiFetch(
    `/api/admin/materials/${contentId}/scope-impact${queryString ? `?${queryString}` : ""}`
  );
}

export async function getMaterialImpact(contentId) {
  return apiFetch(`/api/admin/materials/${contentId}/impact`);
}

export async function createMaterial(payload) {
  return apiFetch("/api/admin/materials", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateMaterial(contentId, payload) {
  return apiFetch(`/api/admin/materials/${contentId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function updateMaterialStatus(contentId, status) {
  return apiFetch(`/api/admin/materials/${contentId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function deleteMaterial(contentId) {
  return apiFetch(`/api/admin/materials/${contentId}`, {
    method: "DELETE",
  });
}
