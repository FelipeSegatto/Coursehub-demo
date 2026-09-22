import { useEffect, useState } from "react";
import { listMessages, sendMessage, markConversationRead } from "../services/ChatService";

const POLL_MS = 5000;

/**
 * Messages for one open conversation: fetched fresh on selection,
 * marked read, then polled silently every 5s while open (paused
 * while hidden). Shared by every chat page for the same reason as
 * useChatInbox. Optimistic send with clientMessageId reconciliation
 * and a visible failed-state on error.
 */
export function useChatThread({ conversationId, currentUserId, currentUserName, onMessageSent }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [olderCursor, setOlderCursor] = useState(null);

  useEffect(() => {
    if (!conversationId) return undefined;

    let cancelled = false;

    async function fetchMessages() {
      setLoading(true);

      try {
        const result = await listMessages(conversationId, { limit: 30 });

        if (cancelled) return;

        setMessages([...(result?.items || [])].reverse());
        setOlderCursor(result?.nextCursor || null);
        setError("");
      } catch (requestError) {
        if (cancelled) return;

        setError(requestError.message || "Não foi possível carregar as mensagens.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchMessages();
    markConversationRead(conversationId).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return undefined;

    let intervalId = null;
    let cancelled = false;

    async function fetchMessagesSilently() {
      try {
        const result = await listMessages(conversationId, { limit: 30 });

        if (cancelled) return;

        setMessages((current) => {
          const fresh = [...(result?.items || [])].reverse();
          const optimistic = current.filter((item) => item.pending);

          return [...fresh, ...optimistic];
        });
        setOlderCursor(result?.nextCursor || null);
      } catch {
        // Silent poll -- a transient failure just tries again next tick.
      }
    }

    function start() {
      if (intervalId) return;
      intervalId = setInterval(() => {
        if (!cancelled) fetchMessagesSilently();
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
        fetchMessagesSilently();
        start();
      }
    }

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [conversationId]);

  async function handleSend(body) {
    const clientMessageId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const optimisticMessage = {
      messageId: clientMessageId,
      senderUserId: currentUserId,
      senderName: currentUserName,
      messageType: "text",
      body,
      createdAt: new Date().toISOString(),
      pending: true,
    };

    setMessages((current) => [...current, optimisticMessage]);

    try {
      const result = await sendMessage(conversationId, { body, clientMessageId });

      setMessages((current) =>
        current.map((item) => (item.messageId === clientMessageId ? { ...result, pending: false } : item))
      );
      onMessageSent?.();
    } catch {
      setMessages((current) =>
        current.map((item) =>
          item.messageId === clientMessageId ? { ...item, pending: false, failed: true } : item
        )
      );
    }
  }

  async function handleLoadOlderMessages() {
    if (!olderCursor || !conversationId) return;

    try {
      const result = await listMessages(conversationId, { limit: 30, cursor: olderCursor });
      const older = [...(result?.items || [])].reverse();

      setMessages((current) => [...older, ...current]);
      setOlderCursor(result?.nextCursor || null);
    } catch {
      // Silent -- staying on the current page is better than an
      // error banner for a "load more history" action.
    }
  }

  return { messages, loading, error, olderCursor, handleSend, handleLoadOlderMessages };
}
