import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import {
  listAdministrativeQueue,
  listStaffQueue,
  assignChatTicket,
  getConversation,
  resolveConversation,
} from "../../services/ChatService";
import { useChatThread } from "../../hooks/useChatThread";
import InstitutionalChatNotice from "../../components/chat/InstitutionalChatNotice";
import ChatThreadPanel from "../../components/chat/ChatThreadPanel";
import NewStaffConversationModal from "../../components/chat/NewStaffConversationModal";

const MODALITY_TABS = [
  { type: "all", label: "Todos" },
  { type: "administrative_support", label: "Alunos" },
  { type: "staff_support", label: "Professores" },
];

const CATEGORY_FILTERS_BY_TYPE = {
  administrative_support: [
    { value: "", label: "Todas" },
    { value: "financial", label: "Financeiro" },
    { value: "calendar", label: "Calendário" },
    { value: "request", label: "Requerimento" },
  ],
  staff_support: [
    { value: "", label: "Todas" },
    { value: "course", label: "Curso" },
    { value: "class", label: "Turma" },
    { value: "schedule", label: "Agenda" },
    { value: "administrative", label: "Administrativo" },
    { value: "other", label: "Outro" },
  ],
};

const ASSIGNMENT_FILTERS = [
  { value: "unassigned", label: "Não atribuídos" },
  { value: "mine", label: "Atribuídos a mim" },
  { value: "all", label: "Todos" },
];

const STATUS_LABEL = {
  open: "Aberto",
  waiting_staff: "Aguardando administração",
  waiting_student: "Aguardando aluno",
  waiting_teacher: "Aguardando professor",
  resolved: "Resolvido",
  closed: "Encerrado",
};

const QUEUE_FETCHERS_BY_TYPE = {
  administrative_support: listAdministrativeQueue,
  staff_support: listStaffQueue,
};

function formatConversationTime(value) {
  if (!value) return "";

  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function requesterName(item) {
  return item.modality === "staff_support" ? item.teacher?.name : item.student?.name;
}

const MODALITY_TAG_LABEL = {
  administrative_support: "Aluno",
  staff_support: "Professor",
};

export default function ChatAdmin() {
  const { usuarioLogado } = useAuth();
  const currentUserId = usuarioLogado?.id;

  const [searchParams, setSearchParams] = useSearchParams();

  // "Requerimentos pendentes" (card do dashboard, /admin/chat?pending=true)
  // -- não é um filtro de status que a fila já tenha (só
  // unassignedOnly/assignedToUserId), então em vez de inventar mais
  // estado, isso reflete direto da URL e semeia modality=administrative_support
  // + assignmentFilter="all" (atribuídos e não atribuídos), com
  // resolved/closed removidos da lista abaixo -- ainda "precisam de
  // atendimento" == não resolvido/fechado, igual à definição usada em
  // operations.openAdministrativeRequests no backend.
  const pendingMode = searchParams.get("pending") === "true";

  const [modality, setModality] = useState(pendingMode ? "administrative_support" : MODALITY_TABS[0].type);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [assignmentFilter, setAssignmentFilter] = useState(pendingMode ? "all" : "unassigned");

  // Deep-linked from a notification action path (/admin/chat?conversationId=...)
  // -- getConversation() below fetches the ticket directly regardless
  // of which queue/filter tab is active, so it opens correctly even if
  // it wouldn't currently show up in the left-hand list.
  const [selectedConversationId, setSelectedConversationId] = useState(() => {
    const fromUrl = Number(searchParams.get("conversationId"));

    return Number.isInteger(fromUrl) && fromUrl > 0 ? fromUrl : null;
  });
  const [showNewConversationModal, setShowNewConversationModal] = useState(false);

  useEffect(() => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);

        if (selectedConversationId) {
          next.set("conversationId", String(selectedConversationId));
        } else {
          next.delete("conversationId");
        }

        return next;
      },
      { replace: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversationId]);

  const [queueItems, setQueueItems] = useState([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState("");
  const [queueReloadToken, setQueueReloadToken] = useState(0);

  const [accessState, setAccessState] = useState("idle"); // idle | checking | granted | denied | error
  const [conversationDetail, setConversationDetail] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState("");

  function handleSelectModality(type) {
    setModality(type);
    setCategoryFilter("");
    setSelectedConversationId(null);
  }

  useEffect(() => {
    let cancelled = false;

    async function fetchQueue() {
      setQueueLoading(true);

      try {
        const params = {
          unassignedOnly: assignmentFilter === "unassigned" ? true : undefined,
          assignedToUserId: assignmentFilter === "mine" ? currentUserId : undefined,
          limit: 50,
        };

        let items;

        if (modality === "all") {
          // Category vocabularies don't overlap between modalities
          // (financial/calendar/request vs course/class/schedule/...),
          // so the category filter simply doesn't apply here -- the
          // select is hidden for this tab. Merge both queues and sort
          // by id (a reasonable recency proxy, both are auto-increment)
          // so it reads as one unified feed, not two lists stitched
          // together.
          const [administrativeResult, staffResult] = await Promise.all([
            listAdministrativeQueue(params),
            listStaffQueue(params),
          ]);

          items = [
            ...(administrativeResult?.items || []).map((item) => ({ ...item, modality: "administrative_support" })),
            ...(staffResult?.items || []).map((item) => ({ ...item, modality: "staff_support" })),
          ].sort((a, b) => b.conversationId - a.conversationId);
        } else {
          const fetchQueuePage = QUEUE_FETCHERS_BY_TYPE[modality];
          const result = await fetchQueuePage({ ...params, category: categoryFilter || undefined });

          items = (result?.items || []).map((item) => ({ ...item, modality }));
        }

        if (cancelled) return;

        setQueueItems(items);
        setQueueError("");
      } catch (requestError) {
        if (cancelled) return;

        setQueueError(requestError.message || "Não foi possível carregar a fila.");
      } finally {
        if (!cancelled) setQueueLoading(false);
      }
    }

    fetchQueue();

    return () => {
      cancelled = true;
    };
  }, [modality, categoryFilter, assignmentFilter, currentUserId, queueReloadToken]);

  useEffect(() => {
    if (!selectedConversationId) return undefined;

    let cancelled = false;

    async function checkAccess() {
      setAccessState("checking");
      setClaimError("");

      try {
        const result = await getConversation(selectedConversationId);

        if (cancelled) return;

        setConversationDetail(result);
        setAccessState("granted");
      } catch (requestError) {
        if (cancelled) return;

        setAccessState(requestError.status === 404 ? "denied" : "error");
      }
    }

    checkAccess();

    return () => {
      cancelled = true;
    };
  }, [selectedConversationId, queueReloadToken]);

  const threadConversationId = accessState === "granted" ? selectedConversationId : null;

  const { messages, loading: messagesLoading, error: messagesError, olderCursor, handleSend, handleLoadOlderMessages } =
    useChatThread({
      conversationId: threadConversationId,
      currentUserId,
      currentUserName: usuarioLogado?.name,
      onMessageSent: () => setQueueReloadToken((token) => token + 1),
    });

  // "Pendente" == ainda precisa de atendimento -- resolved/closed não
  // conta, mesmo que a fila em si (unassignedOnly/assignedToUserId)
  // não distinga por status.
  const visibleQueueItems = pendingMode
    ? queueItems.filter((item) => item.status !== "resolved" && item.status !== "closed")
    : queueItems;

  const selectedQueueItem = queueItems.find((item) => item.conversationId === selectedConversationId) || null;

  async function handleClaim() {
    if (!selectedConversationId) return;

    try {
      setClaiming(true);
      setClaimError("");

      await assignChatTicket(selectedConversationId);

      setQueueReloadToken((token) => token + 1);
    } catch (requestError) {
      setClaimError(requestError.message || "Não foi possível assumir o atendimento.");
    } finally {
      setClaiming(false);
    }
  }

  async function handleResolve() {
    if (!selectedConversationId) return;

    try {
      await resolveConversation(selectedConversationId);
      setQueueReloadToken((token) => token + 1);
    } catch {
      // Silent -- the button stays visible and the admin can try again.
    }
  }

  function handleConversationStarted(conversationId) {
    setShowNewConversationModal(false);
    setQueueReloadToken((token) => token + 1);
    setSelectedConversationId(conversationId);
  }

  return (
    <main className="p-6">
      <section className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Atendimento institucional</h1>
        <p className="mt-2 text-gray-600">
          Protocolos abertos por alunos e conversas com professores atendidos pela administração.
        </p>
        <InstitutionalChatNotice className="mt-2" />

        {pendingMode && (
          <p className="mt-3 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
            Mostrando só requerimentos ainda não resolvidos.
            <button
              type="button"
              onClick={() =>
                setSearchParams(
                  (previous) => {
                    const next = new URLSearchParams(previous);
                    next.delete("pending");
                    return next;
                  },
                  { replace: true }
                )
              }
              className="font-semibold hover:underline"
            >
              Remover filtro
            </button>
          </p>
        )}
      </section>

      <section className="grid h-[min(40rem,calc(100dvh-12rem))] grid-rows-[minmax(0,1fr)] overflow-hidden rounded-2xl bg-white shadow md:grid-cols-[360px_minmax(0,1fr)] lg:grid-cols-[430px_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col overflow-hidden border-b border-gray-200 md:border-b-0 md:border-r">
          <div className="flex gap-1 border-b border-gray-200 p-2">
            {MODALITY_TABS.map((tab) => (
              <button
                key={tab.type}
                type="button"
                onClick={() => handleSelectModality(tab.type)}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  modality === tab.type ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 p-2">
            {modality !== "all" && (
              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                Categoria
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-700 focus:border-blue-500 focus:outline-none"
                >
                  {CATEGORY_FILTERS_BY_TYPE[modality].map((filter) => (
                    <option key={filter.value} value={filter.value}>
                      {filter.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              Atribuição
              <select
                value={assignmentFilter}
                onChange={(event) => setAssignmentFilter(event.target.value)}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-700 focus:border-blue-500 focus:outline-none"
              >
                {ASSIGNMENT_FILTERS.map((filter) => (
                  <option key={filter.value} value={filter.value}>
                    {filter.label}
                  </option>
                ))}
              </select>
            </label>

            {modality === "staff_support" && (
              <button
                type="button"
                onClick={() => setShowNewConversationModal(true)}
                className="ml-auto rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
              >
                Nova conversa
              </button>
            )}
          </div>

          {queueLoading && <p className="px-4 py-6 text-center text-sm text-gray-500">Carregando...</p>}

          {!queueLoading && queueError && <p className="px-4 py-3 text-center text-sm text-red-700">{queueError}</p>}

          {!queueLoading && !queueError && visibleQueueItems.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-gray-500">Nenhum protocolo nesta fila.</p>
          )}

          <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:#9ca3af_#f3f4f6] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-400">
            {visibleQueueItems.map((item) => (
              <li key={item.conversationId}>
                <button
                  type="button"
                  onClick={() => setSelectedConversationId(item.conversationId)}
                  className={`flex w-full flex-col items-start gap-1 px-4 py-3 text-left text-sm transition hover:bg-gray-50 ${
                    selectedConversationId === item.conversationId ? "bg-blue-50" : ""
                  }`}
                >
                  <span className="block w-full truncate font-semibold text-gray-900">{item.title || "Protocolo"}</span>
                  <span className="block truncate text-xs text-gray-500">{requesterName(item)}</span>
                  <span className="flex w-full items-center justify-between text-xs text-gray-400">
                    <span className="flex items-center gap-1.5">
                      {modality === "all" && (
                        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                          {MODALITY_TAG_LABEL[item.modality]}
                        </span>
                      )}
                      {STATUS_LABEL[item.status] || item.status}
                    </span>
                    <span>{formatConversationTime(item.lastMessageAt || item.createdAt)}</span>
                  </span>
                  {item.assignedAdminName && (
                    <span className="text-xs text-blue-600">Com {item.assignedAdminName}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden">
          {!selectedConversationId && (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-gray-500">
              Selecione um protocolo na lista.
            </div>
          )}

          {selectedConversationId && accessState === "checking" && (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-gray-500">
              Carregando...
            </div>
          )}

          {selectedConversationId && accessState === "error" && (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-red-700">
              Não foi possível carregar este protocolo.
            </div>
          )}

          {selectedConversationId && accessState === "denied" && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <h3 className="font-bold text-gray-900">{selectedQueueItem?.title || "Protocolo"}</h3>
              <p className="text-sm text-gray-600">
                {(selectedQueueItem && requesterName(selectedQueueItem)) || "—"}
                {selectedQueueItem?.assignedAdminName && ` · atualmente com ${selectedQueueItem.assignedAdminName}`}
              </p>
              <p className="text-sm text-gray-500">
                Você ainda não está neste atendimento. Assuma o protocolo para ver as mensagens e responder.
              </p>

              {claimError && <p className="text-sm text-red-700">{claimError}</p>}

              <button
                type="button"
                onClick={handleClaim}
                disabled={claiming}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {claiming ? "Assumindo..." : "Assumir atendimento"}
              </button>
            </div>
          )}

          {selectedConversationId && accessState === "granted" && (
            <ChatThreadPanel
              title={conversationDetail?.title || "Protocolo"}
              conversation={conversationDetail}
              messages={messages}
              loading={messagesLoading}
              error={messagesError}
              olderCursor={olderCursor}
              onLoadOlder={handleLoadOlderMessages}
              onSend={handleSend}
              canPost={conversationDetail?.canPost !== false}
              currentUserId={currentUserId}
              onResolve={handleResolve}
            />
          )}
        </div>
      </section>

      {showNewConversationModal && (
        <NewStaffConversationModal
          onClose={() => setShowNewConversationModal(false)}
          onConversationStarted={handleConversationStarted}
        />
      )}
    </main>
  );
}
