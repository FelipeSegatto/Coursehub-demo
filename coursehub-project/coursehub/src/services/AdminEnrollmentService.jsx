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

export async function listEnrollments(params = {}) {
  const queryString = buildQueryString(params);

  return apiFetch(
    queryString ? `/api/admin/enrollments?${queryString}` : "/api/admin/enrollments"
  );
}

export async function getEnrollmentById(enrollmentId) {
  return apiFetch(`/api/admin/enrollments/${enrollmentId}`);
}

export async function createEnrollment(payload) {
  return apiFetch("/api/admin/enrollments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateEnrollment(enrollmentId, payload) {
  return apiFetch(`/api/admin/enrollments/${enrollmentId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function updateEnrollmentStatus(enrollmentId, status) {
  return apiFetch(`/api/admin/enrollments/${enrollmentId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function getClassChangeImpact(enrollmentId) {
  return apiFetch(`/api/admin/enrollments/${enrollmentId}/class-change-impact`);
}

export async function changeEnrollmentClass(enrollmentId, { newClassId, reason }) {
  return apiFetch(`/api/admin/enrollments/${enrollmentId}/change-class`, {
    method: "POST",
    body: JSON.stringify({ newClassId, reason }),
  });
}
