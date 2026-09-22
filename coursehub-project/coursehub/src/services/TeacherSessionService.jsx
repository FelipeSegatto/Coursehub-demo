import { apiFetch } from "./APIService";

function buildQueryString(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    const shouldIgnore = value === undefined || value === null || value === "";

    if (!shouldIgnore) query.append(key, String(value));
  });

  return query.toString();
}

export async function listTeacherSessions(userId, classId, params = {}) {
  const queryString = buildQueryString(params);
  const base = `/api/teacher/by-user/${userId}/classes/${classId}/sessions`;

  return apiFetch(queryString ? `${base}?${queryString}` : base);
}

/**
 * Função de salvar injetada no SessionModal compartilhado (ver
 * components/teachers/SessionModal.jsx) -- só o professor usa esta
 * versão, que sempre passa pelos endpoints /api/teacher/by-user/...
 * já existentes.
 */
export function saveTeacherSession(userId) {
  return async function save(payload, { isEditing, session, classId }) {
    if (isEditing) {
      return apiFetch(`/api/teacher/by-user/${userId}/class-sessions/${session.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    }

    return apiFetch(`/api/teacher/by-user/${userId}/classes/${classId}/sessions`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  };
}

export async function cancelTeacherSession(userId, sessionId) {
  return apiFetch(`/api/teacher/by-user/${userId}/class-sessions/${sessionId}`, {
    method: "DELETE",
  });
}
