import { useEffect, useState } from "react";
import {
  listConversationAccessLogs,
  listSupervisedMessages,
  listSupervisionConversations,
  superviseConversation,
} from "../../services/ChatService";
import InstitutionalChatNotice from "../../components/chat/InstitutionalChatNotice";

const TYPE_TABS = [
  { type: "teacher_support", label: "Dúvidas com professor" },
  { type: "academic_peer", label: "Colegas e turma" },
];

const ACCESS_REASONS = [
  { value: "support", label: "Atendimento" },
  { value: "safety", label: "Segurança" },
  { value: "report_review", label: "Revisão de report" },
  { value: "academic_audit", label: "Auditoria acadêmica" },
  { value: "financial_audit", label: "Auditoria financeira" },
  { value: "other", label: "Outro" },
];

const TYPE_LABEL = {
  teacher_support: "Dúvida com professor",
  academic_peer: "Colegas",
};

function formatWhen(value) {
  if (!value) return "";

  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatSupervisionAdmin() {
  const [type, setType] = useState(TYPE_TABS[0].type);
  const [search, setSearch] = useState("");
  const [accessReason, setAccessReason] = useState("support");
  const [conversations, setConversations] = useState([]);
  const [listError, setListError] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [messages, setMessages] = useState([]);
  const [logs, setLogs] = useState([]);
  const [threadError, setThreadError] = useState("");
  const [loadingThread, setLoadingThread] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadList() {
      setLoadingList(true);
      setListError("");

      try {
        const result = await listSupervisionConversations({ type, search, limit: 40 });

        if (!cancelled) setConversations(result.items || []);
      } catch (error) {
        if (!cancelled) setListError(error.message || "Não foi possível carregar as conversas.");
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    }

    const timer = setTimeout(loadList, search ? 250 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [type, search]);

  async function openConversation(conversationId) {
    setSelectedId(conversationId);
    setLoadingThread(true);
    setThreadError("");
    setDetail(null);
    setMessages([]);
    setLogs([]);

    try {
      const opened = await superviseConversation(conversationId, { accessReason });
      const [messagePage, logPage] = await Promise.all([
        listSupervisedMessages(conversationId, { limit: 50 }),
        listConversationAccessLogs(conversationId),
      ]);

      setDetail(opened);
      setMessages(messagePage.items || []);
      setLogs(logPage.items || []);
    } catch (error) {
      setThreadError(error.message || "Não foi possível abrir a conversa.");
    } finally {
      setLoadingThread(false);
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Chat</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Supervisão</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Dúvidas de aluno com professor e conversas entre colegas. Abrir uma conversa registra o acesso.
          </p>
        </div>
        <InstitutionalChatNotice className="max-w-sm" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex gap-2 border-b border-slate-100 p-3">
            {TYPE_TABS.map((tab) => (
              <button
                key={tab.type}
                type="button"
                onClick={() => {
                  setType(tab.type);
                  setSelectedId(null);
                  setDetail(null);
                  setMessages([]);
                  setLogs([]);
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  type === tab.type ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="border-b border-slate-100 p-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por título ou nome"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
            />
            <label className="mt-3 block text-xs font-medium text-slate-500">
              Motivo do acesso
              <select
                value={accessReason}
                onChange={(event) => setAccessReason(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800"
              >
                {ACCESS_REASONS.map((reason) => (
                  <option key={reason.value} value={reason.value}>
                    {reason.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {listError && <p className="p-4 text-sm text-red-600">{listError}</p>}
          {loadingList && <p className="p-4 text-sm text-slate-500">Carregando…</p>}
          {!loadingList && conversations.length === 0 && (
            <p className="p-4 text-sm text-slate-500">Nenhuma conversa neste recorte.</p>
          )}

          <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto">
            {conversations.map((conversation) => (
              <li key={conversation.conversationId}>
                <button
                  type="button"
                  onClick={() => openConversation(conversation.conversationId)}
                  className={`w-full px-4 py-3 text-left ${
                    selectedId === conversation.conversationId ? "bg-slate-50" : "hover:bg-slate-50"
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900">
                    {conversation.channelKind === "group"
                      ? conversation.title || "Chat da turma"
                      : conversation.title || conversation.participantNames || "Conversa"}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {conversation.participantNames || "Sem participantes"}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">{formatWhen(conversation.lastMessageAt)}</p>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          {!selectedId && <p className="text-sm text-slate-500">Escolha uma conversa para ler e registrar o acesso.</p>}
          {threadError && <p className="text-sm text-red-600">{threadError}</p>}
          {loadingThread && <p className="text-sm text-slate-500">Abrindo conversa…</p>}

          {detail && (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                {TYPE_LABEL[detail.type] || detail.type}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-950">{detail.title || "Conversa"}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {(detail.participants || []).map((participant) => participant.name).join(", ")}
              </p>

              <div className="mt-5 max-h-96 space-y-3 overflow-y-auto">
                {messages.length === 0 && <p className="text-sm text-slate-500">Sem mensagens.</p>}
                {[...messages].reverse().map((message) => (
                  <article key={message.messageId} className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="text-xs font-semibold text-slate-700">
                      {message.senderName || "Sistema"}
                      <span className="ml-2 font-normal text-slate-400">{formatWhen(message.createdAt)}</span>
                      {message.isDeleted && <span className="ml-2 text-amber-700">apagada para os participantes</span>}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{message.body}</p>
                  </article>
                ))}
              </div>

              <div className="mt-6 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-semibold text-slate-900">Acessos registrados</h3>
                {logs.length === 0 && <p className="mt-2 text-sm text-slate-500">Nenhum acesso registrado.</p>}
                <ul className="mt-2 space-y-2">
                  {logs.map((log) => (
                    <li key={log.id} className="text-sm text-slate-600">
                      <span className="font-medium text-slate-800">{log.adminName}</span>
                      {" · "}
                      {ACCESS_REASONS.find((reason) => reason.value === log.accessReason)?.label || log.accessReason}
                      {" · "}
                      {formatWhen(log.createdAt)}
                      {log.details ? ` · ${log.details}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
