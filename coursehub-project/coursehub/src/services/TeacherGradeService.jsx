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

export async function getClassActivityGrades(params = {}) {
  const queryString = buildQueryString(params);

  return apiFetch(queryString ? `/api/teacher/grades?${queryString}` : "/api/teacher/grades");
}

export async function quickGradeSubmission(userId, submissionId, { score, feedback }) {
  return apiFetch(`/api/teacher/by-user/${userId}/submissions/${submissionId}/quick-grade`, {
    method: "PATCH",
    body: JSON.stringify({ score, feedback }),
  });
}
