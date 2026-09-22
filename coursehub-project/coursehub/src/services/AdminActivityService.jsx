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

/**
 * Fábrica de client — /activities e /assessments só diferem pelo
 * prefixo da URL; o backend já força o activity_kind em cada um,
 * então o frontend não precisa (nem deve) enviar o kind.
 */
export function createAdminActivityService(resourcePath) {
  const base = `/api/admin/${resourcePath}`;

  return {
    list(params = {}) {
      const queryString = buildQueryString(params);

      return apiFetch(queryString ? `${base}?${queryString}` : base);
    },

    getById(id) {
      return apiFetch(`${base}/${id}`);
    },

    getImpact(id) {
      return apiFetch(`${base}/${id}/impact`);
    },

    create(payload) {
      return apiFetch(base, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },

    update(id, payload) {
      return apiFetch(`${base}/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    },

    updateStatus(id, status) {
      return apiFetch(`${base}/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    },

    remove(id) {
      return apiFetch(`${base}/${id}`, {
        method: "DELETE",
      });
    },
  };
}
