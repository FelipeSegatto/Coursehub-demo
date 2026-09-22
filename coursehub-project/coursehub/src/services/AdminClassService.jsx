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

export async function listClasses(params = {}) {
  const queryString = buildQueryString(params);

  return apiFetch(
    queryString ? `/api/admin/classes?${queryString}` : "/api/admin/classes"
  );
}

export async function getClassById(classId) {
  return apiFetch(`/api/admin/classes/${classId}`);
}

export async function getClassImpact(classId) {
  return apiFetch(`/api/admin/classes/${classId}/impact`);
}

export async function createClass(payload) {
  return apiFetch("/api/admin/classes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateClass(classId, payload) {
  return apiFetch(`/api/admin/classes/${classId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function updateClassStatus(classId, status) {
  return apiFetch(`/api/admin/classes/${classId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function deleteClass(classId) {
  return apiFetch(`/api/admin/classes/${classId}`, {
    method: "DELETE",
  });
}
