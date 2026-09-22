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

const base = "/api/admin/grades";

export const AdminGradeService = {
  list(params = {}) {
    const queryString = buildQueryString(params);

    return apiFetch(queryString ? `${base}?${queryString}` : base);
  },

  getById(id) {
    return apiFetch(`${base}/${id}`);
  },

  adjust(id, { score, reason }) {
    return apiFetch(`${base}/${id}/adjust`, {
      method: "PATCH",
      body: JSON.stringify({ score, reason }),
    });
  },
};
