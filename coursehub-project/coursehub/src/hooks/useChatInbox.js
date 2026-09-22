import { useCallback, useEffect, useState } from "react";
import { listConversations } from "../services/ChatService";

const POLL_MS = 30000;

/**
 * Conversation list for one type/status filter, polled every 30s
 * (paused while hidden). Shared by every chat page (aluno's tabs,
 * professor's queue) instead of duplicating the fetch-on-mount +
 * poll + visibility-pause effect in each one.
 *
 * fetchConversations is declared inside the effect on purpose --
 * calling an external useCallback from an effect body trips
 * react-hooks/set-state-in-effect (same fix as useNotificationInbox.js).
 */
export function useChatInbox({ type, status } = {}) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let intervalId = null;
    let cancelled = false;

    async function fetchConversations() {
      try {
        const result = await listConversations({ type, status, limit: 30 });

        if (cancelled) return;

        setConversations(result?.items || []);
        setError("");
      } catch (requestError) {
        if (cancelled) return;

        setError(requestError.message || "Não foi possível carregar as conversas.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    function start() {
      if (intervalId) return;
      intervalId = setInterval(() => {
        if (!cancelled) fetchConversations();
      }, POLL_MS);
    }

    function stop() {
      if (!intervalId) return;
      clearInterval(intervalId);
      intervalId = null;
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        stop();
      } else {
        fetchConversations();
        start();
      }
    }

    fetchConversations();
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [type, status, reloadToken]);

  return { conversations, setConversations, loading, error, refresh };
}
