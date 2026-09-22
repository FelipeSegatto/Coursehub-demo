import { useCallback, useEffect, useState } from "react";
import {
  listNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  archiveNotification,
} from "../services/NotificationService";

/**
 * Role-agnostic inbox state machine shared by the aluno/professor/
 * admin notification pages -- every field the backend returns
 * (title, message, actionPath, priority) is already role-correct
 * from the notification type registry, so nothing here needs to know
 * which role is calling it.
 *
 * mark-read/archive/mark-all-read update local state immediately
 * (optimistic) and roll back to the pre-mutation snapshot if the
 * request fails, instead of waiting for the response before
 * reflecting the change.
 */
export function useNotificationInbox() {
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  // reloadToken lets the "Tentar novamente" retry button force a
  // re-fetch without depending on status changing -- bumping it
  // re-runs the effect below with the same status.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    // Inline on purpose (same idiom as useCalendarEvents.js) --
    // calling an external useCallback-wrapped function from here
    // trips react-hooks/set-state-in-effect, since the linter can't
    // see past the callback boundary that the synchronous
    // setLoading(true) at the top is guarded by the cancelled flag.
    async function load() {
      try {
        setLoading(true);
        setError("");

        const [inboxResult, unreadResult] = await Promise.all([
          listNotifications({ status, category: category === "all" ? undefined : category }),
          getUnreadNotificationCount(),
        ]);

        if (cancelled) return;

        setItems(inboxResult?.items || []);
        setNextCursor(inboxResult?.nextCursor || null);
        setUnreadCount(unreadResult?.unreadCount ?? 0);
      } catch (requestError) {
        if (cancelled) return;

        console.error("[useNotificationInbox] erro ao carregar:", requestError);
        setError(requestError.message || "Não foi possível carregar as notificações.");
        setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [status, category, reloadToken]);

  const loadFirstPage = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  async function handleLoadMore() {
    if (!nextCursor) return;

    try {
      setLoadingMore(true);

      const result = await listNotifications({
        status,
        category: category === "all" ? undefined : category,
        cursor: nextCursor,
      });

      setItems((current) => [...current, ...(result?.items || [])]);
      setNextCursor(result?.nextCursor || null);
    } catch (requestError) {
      console.error("[useNotificationInbox] erro ao carregar mais:", requestError);
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleMarkRead(notificationId) {
    const target = items.find((item) => item.notificationId === notificationId);

    if (!target || target.readAt) return;

    const previousItems = items;
    const previousUnreadCount = unreadCount;

    setItems((current) =>
      current.map((item) =>
        item.notificationId === notificationId
          ? { ...item, readAt: new Date().toISOString() }
          : item
      )
    );
    setUnreadCount((current) => Math.max(current - 1, 0));

    try {
      await markNotificationRead(notificationId);
    } catch (requestError) {
      console.error("[useNotificationInbox] erro ao marcar como lida:", requestError);
      setItems(previousItems);
      setUnreadCount(previousUnreadCount);
    }
  }

  async function handleMarkAllRead() {
    if (unreadCount === 0) return;

    const previousItems = items;
    const previousUnreadCount = unreadCount;
    const now = new Date().toISOString();

    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt || now })));
    setUnreadCount(0);

    try {
      await markAllNotificationsRead();
    } catch (requestError) {
      console.error("[useNotificationInbox] erro ao marcar todas como lidas:", requestError);
      setItems(previousItems);
      setUnreadCount(previousUnreadCount);
    }
  }

  async function handleArchive(notificationId) {
    const target = items.find((item) => item.notificationId === notificationId);

    if (!target) return;

    const previousItems = items;
    const previousUnreadCount = unreadCount;

    setItems((current) => current.filter((item) => item.notificationId !== notificationId));

    if (!target.readAt) {
      setUnreadCount((current) => Math.max(current - 1, 0));
    }

    try {
      await archiveNotification(notificationId);
    } catch (requestError) {
      console.error("[useNotificationInbox] erro ao arquivar:", requestError);
      setItems(previousItems);
      setUnreadCount(previousUnreadCount);
    }
  }

  return {
    status,
    setStatus,
    category,
    setCategory,
    items,
    nextCursor,
    unreadCount,
    loading,
    loadingMore,
    error,
    loadFirstPage,
    handleLoadMore,
    handleMarkRead,
    handleMarkAllRead,
    handleArchive,
  };
}
