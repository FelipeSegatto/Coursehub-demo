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

export async function listStudentProgress(userId, params = {}) {
  const queryString = buildQueryString(params);
  const basePath = `/api/teacher/by-user/${userId}/student-progress`;

  return apiFetch(queryString ? `${basePath}?${queryString}` : basePath);
}

export async function getEnrollmentProgress(userId, enrollmentId) {
  return apiFetch(`/api/teacher/by-user/${userId}/student-progress/enrollments/${enrollmentId}`);
}
