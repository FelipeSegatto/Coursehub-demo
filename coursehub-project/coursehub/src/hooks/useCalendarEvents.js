import { useEffect, useState } from "react";
import { apiFetch } from "../services/APIService";

function buildEndpoint(role, userId, from, to) {
  const query = `from=${from}&to=${to}`;

  if (role === "student") {
    return `/api/students/by-user/calendar?${query}`;
  }

  if (role === "teacher") {
    return `/api/teacher/by-user/${userId}/calendar?${query}`;
  }

  return `/api/admin/calendar/events?${query}`;
}

/**
 * Busca os eventos do calendário para o período [from, to] já
 * autorizado pelo backend (role/userId decidem o escopo — o
 * frontend não filtra por matrícula/posse, só exibe o que a API já
 * devolveu). Um fetch por mudança de período; filtros macro/micro
 * são aplicados depois, no client, sobre este mesmo array.
 */
export function useCalendarEvents({ role, userId, from, to, reloadToken = 0 }) {
  const [events, setEvents] = useState([]);
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!from || !to) return;

    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const data = await apiFetch(buildEndpoint(role, userId, from, to));

        if (cancelled) return;

        setEvents(Array.isArray(data.events) ? data.events : []);
        setCounts(data.counts || null);
      } catch (loadError) {
        if (cancelled) return;

        setEvents([]);
        setCounts(null);
        setError(
          loadError.data?.message ||
            loadError.message ||
            "Não foi possível carregar o calendário."
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [role, userId, from, to, reloadToken]);

  return { events, counts, loading, error };
}
