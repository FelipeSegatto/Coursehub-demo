import { useCallback, useEffect, useRef, useState } from "react";
import { getUnreadNotificationCount } from "../services/NotificationService";

const POLL_INTERVAL_MS = 30000;

/**
 * Polls the unread notification count every 30s, paused while the
 * tab is hidden (document.visibilitychange) and refreshed
 * immediately when it becomes visible again -- avoids polling a
 * backgrounded tab for nothing, and avoids showing a stale count
 * when the user comes back to it.
 */
export function useUnreadNotifications({ enabled = true } = {}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const intervalRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;

    try {
      const result = await getUnreadNotificationCount();
      setUnreadCount(result?.unreadCount ?? 0);
    } catch {
      // Silent -- a badge count failing to refresh shouldn't surface
      // an error to the user, it just stays at its last known value.
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;

    async function tick() {
      if (cancelled) return;
      await refresh();
    }

    tick();

    function startPolling() {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(tick, POLL_INTERVAL_MS);
    }

    function stopPolling() {
      if (!intervalRef.current) return;
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        stopPolling();
      } else {
        tick();
        startPolling();
      }
    }

    if (!document.hidden) {
      startPolling();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, refresh]);

  return { unreadCount, refresh };
}
