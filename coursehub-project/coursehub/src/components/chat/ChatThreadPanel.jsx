import { useEffect, useRef } from "react";
import ChatMessageBubble from "./ChatMessageBubble";
import ChatMessageComposer from "./ChatMessageComposer";

const THREAD_SCROLL_CLASS =
  "min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 [scrollbar-width:thin] [scrollbar-color:#9ca3af_#f3f4f6] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-400";

const STATUS_LABEL = {
  open: "Aberta",
  waiting_staff: "Aguardando professor",
  waiting_student: "Aguardando aluno",
  waiting_teacher: "Aguardando professor",
  waiting_admin: "Aguardando administração",
  resolved: "Resolvida",
  closed: "Encerrada",
};

const TOPIC_LABEL = {
  content: "Conteúdo",
  activity: "Atividade",
  exam: "Avaliação",
  grade: "Nota",
  attendance: "Frequência",
  session: "Encontro",
  general: "Geral",
};

export default function ChatThreadPanel({
  title,
  conversation,
  messages,
  loading,
  error,
  olderCursor,
  onLoadOlder,
  onSend,
  canPost,
  currentUserId,
  onArchive,
  onResolve,
  onBack,
  emptyStateText = "Selecione uma conversa ou comece uma nova.",
}) {
  const historyRef = useRef(null);
  const conversationId = conversation?.conversationId;

  useEffect(() => {
    if (!conversationId || loading) return;

    const history = historyRef.current;

    if (!history) return;

    history.scrollTop = history.scrollHeight;
  }, [conversationId, loading]);

  if (!conversation) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-sm text-gray-500">
        {emptyStateText}
      </div>
    );
  }

  const isResolved = conversation.status === "resolved" || conversation.status === "closed";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-200 p-4">
        <div className="flex min-w-0 items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Voltar para as conversas"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 md:hidden"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-4 w-4"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          )}

        <div className="min-w-0">
          <h3 className="truncate font-bold text-gray-900">{title}</h3>
          <div className="mt-1 flex flex-wrap gap-2">
            {conversation.channelKind === "group" && (
              <span className="rounded-full bg-slate-900 px-2.5 py-0.5 text-xs font-medium text-white">
                Turma
                {conversation.memberCount ? ` · ${conversation.memberCount}` : ""}
              </span>
            )}
            {conversation.category && TOPIC_LABEL[conversation.category] && (
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                {TOPIC_LABEL[conversation.category]}
              </span>
            )}
            {conversation.channelKind !== "group" && conversation.status && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  isResolved ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                }`}
              >
                {STATUS_LABEL[conversation.status] || conversation.status}
              </span>
            )}
          </div>
        </div>
        </div>

        <div className="flex shrink-0 gap-2">
          {onResolve && !isResolved && (
            <button
              type="button"
              onClick={onResolve}
              className="rounded-lg bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700 transition hover:bg-green-200"
            >
              Marcar como resolvida
            </button>
          )}

          {onArchive && (
            <button
              type="button"
              onClick={onArchive}
              className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-200"
            >
              Arquivar
            </button>
          )}
        </div>
      </div>

      <div ref={historyRef} className={THREAD_SCROLL_CLASS}>
        {olderCursor && (
          <div className="text-center">
            <button type="button" onClick={onLoadOlder} className="text-xs font-semibold text-blue-600 hover:underline">
              Carregar mensagens anteriores
            </button>
          </div>
        )}

        {loading && <p className="text-center text-sm text-gray-500">Carregando mensagens...</p>}

        {!loading && error && <p className="text-center text-sm text-red-700">{error}</p>}

        {!loading &&
          messages.map((message) => (
            <ChatMessageBubble
              key={message.messageId}
              message={message}
              isOwn={message.senderUserId === currentUserId}
            />
          ))}
      </div>

      <div className="shrink-0 border-t border-gray-200 p-4">
        <ChatMessageComposer
          onSend={onSend}
          disabled={!canPost || isResolved}
          disabledReason={
            isResolved ? "Esta conversa já foi resolvida." : "Você não pode mais enviar mensagens nesta conversa."
          }
        />
      </div>
    </div>
  );
}
