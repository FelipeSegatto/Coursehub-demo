import { apiFetch } from "./APIService";

function buildQueryString(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    const shouldIgnore = value === undefined || value === null || value === "";

    if (!shouldIgnore) query.append(key, String(value));
  });

  return query.toString();
}

export async function listAdminSessions(params = {}) {
  const queryString = buildQueryString(params);
  const base = "/api/admin/class-sessions";

  return apiFetch(queryString ? `${base}?${queryString}` : base);
}

export async function getAdminSession(sessionId) {
  return apiFetch(`/api/admin/class-sessions/${sessionId}`);
}

/**
 * Função de salvar injetada no SessionModal compartilhado (ver
 * components/teachers/SessionModal.jsx) -- versão administrativa,
 * sempre passa pelos endpoints /api/admin/class-sessions -- nunca
 * finge ser o professor da turma.
 */
export async function saveAdminSession(payload, { isEditing, session, classId }) {
  if (isEditing) {
    return apiFetch(`/api/admin/class-sessions/${session.id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  return apiFetch(`/api/admin/classes/${classId}/sessions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function cancelAdminSession(sessionId) {
  return apiFetch(`/api/admin/class-sessions/${sessionId}`, {
    method: "DELETE",
  });
}
