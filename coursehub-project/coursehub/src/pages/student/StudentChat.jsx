import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { archiveConversation, resolveConversation } from "../../services/ChatService";
import { useChatInbox } from "../../hooks/useChatInbox";
import { useChatThread } from "../../hooks/useChatThread";
import InstitutionalChatNotice from "../../components/chat/InstitutionalChatNotice";
import ChatThreadPanel from "../../components/chat/ChatThreadPanel";
import NewAcademicChatModal from "../../components/chat/NewAcademicChatModal";
import NewTeacherQuestionModal from "../../components/chat/NewTeacherQuestionModal";
import NewAdministrativeTicketModal from "../../components/chat/NewAdministrativeTicketModal";

const TABS = [
  { type: "academic_peer", label: "Colegas" },
  { type: "teacher_support", label: "Professores" },
  { type: "administrative_support", label: "Administração" },
];

const RESOLVABLE_TYPES = new Set(["teacher_support", "administrative_support"]);

function formatConversationTime(value) {
  if (!value) return "";

  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function conversationTitle(conversation) {
  if (conversation.channelKind === "group") {
    return conversation.title || "Chat da turma";
  }

  if (conversation.type === "teacher_support" || conversation.type === "administrative_support") {
    return conversation.title || "Protocolo";
  }

  return conversation.otherParticipant?.name || conversation.title || "Conversa";
}

export default function StudentChat() {
  const { usuarioLogado } = useAuth();
  const currentUserId = usuarioLogado?.id;

  const [activeTab, setActiveTab] = useState(TABS[0].type);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [showNewChatModal, setShowNewChatModal] = useState(false);

  const { conversations, setConversations, loading, error, refresh } = useChatInbox({ type: activeTab });

  const selectedConversation = conversations.find((c) => c.conversationId === selectedConversationId) || null;

  const { messages, loading: messagesLoading, error: messagesError, olderCursor, handleSend, handleLoadOlderMessages } =
    useChatThread({
      conversationId: selectedConversationId,
      currentUserId,
      currentUserName: usuarioLogado?.name,
      onMessageSent: refresh,
    });

  function handleSelectTab(type) {
    setActiveTab(type);
    setSelectedConversationId(null);
  }

  async function handleArchive() {
    if (!selectedConversationId) return;

    try {
      await archiveConversation(selectedConversationId);

      setConversations((current) => current.filter((item) => item.conversationId !== selectedConversationId));
      setSelectedConversationId(null);
    } catch {
      // Leave the item in place -- nothing to roll back visually beyond that.
    }
  }

  async function handleResolve() {
    if (!selectedConversationId) return;

    try {
      await resolveConversation(selectedConversationId);
      refresh();
    } catch {
      // Silent -- the button stays visible and the user can try again.
    }
  }

  function handleConversationStarted(conversationId) {
    setShowNewChatModal(false);
    refresh();
    setSelectedConversationId(conversationId);
  }

  const canPost = selectedConversation ? selectedConversation.canPost !== false : true;

  return (
    <main className="p-4 sm:p-6">
      <section className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Chat</h1>
        <p className="mt-2 text-gray-600">
          O chat da turma reúne todos os colegas. Use nova conversa para falar em particular
          com um colega, tirar dúvida com o professor ou abrir um protocolo.
        </p>
        <InstitutionalChatNotice className="mt-2" />
      </section>

      <section className="grid h-[min(40rem,calc(100dvh-12rem))] grid-rows-[minmax(0,1fr)] overflow-hidden rounded-2xl bg-white shadow md:grid-cols-[320px_minmax(0,1fr)]">
        <div
          className={`${
            selectedConversationId ? "hidden md:flex" : "flex"
          } min-h-0 flex-col overflow-hidden border-b border-gray-200 md:border-b-0 md:border-r`}
        >
          <div className="flex gap-1 border-b border-gray-200 p-2">
            {TABS.map((tab) => (
              <button
                key={tab.type}
                type="button"
                onClick={() => handleSelectTab(tab.type)}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  activeTab === tab.type ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between p-4">
            <h2 className="font-bold text-gray-900">Conversas</h2>
            <button
              type="button"
              onClick={() => setShowNewChatModal(true)}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
            >
              Nova conversa
            </button>
          </div>

          {loading && <p className="px-4 py-6 text-center text-sm text-gray-500">Carregando...</p>}

          {!loading && error && <p className="px-4 py-3 text-center text-sm text-red-700">{error}</p>}

          {!loading && !error && conversations.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-gray-500">
              {activeTab === "academic_peer" && "O chat da turma aparece sozinho quando você está em uma turma. Nova conversa abre um papo particular."}
              {activeTab === "teacher_support" && "Nenhuma dúvida ainda. Comece uma com um professor."}
              {activeTab === "administrative_support" && "Nenhum protocolo ainda. Abra um com a administração."}
            </p>
          )}

          <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:#9ca3af_#f3f4f6] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-400">
            {conversations.map((conversation) => {
              const isUnread =
                conversation.lastMessageId &&
                (conversation.lastReadMessageId ?? 0) < conversation.lastMessageId;

              return (
                <li key={conversation.conversationId}>
                  <button
                    type="button"
                    onClick={() => setSelectedConversationId(conversation.conversationId)}
                    className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm transition hover:bg-gray-50 ${
                      selectedConversationId === conversation.conversationId ? "bg-blue-50" : ""
                    }`}
                  >
                    <span className="min-w-0">
                      <span className={`block truncate ${isUnread ? "font-bold text-gray-900" : "text-gray-700"}`}>
                        {conversationTitle(conversation)}
                      </span>
                      <span className="block text-xs text-gray-400">
                        {conversation.channelKind === "group"
                          ? `${conversation.memberCount || 0} colegas · ${formatConversationTime(
                              conversation.lastMessageAt || conversation.createdAt
                            )}`
                          : formatConversationTime(conversation.lastMessageAt || conversation.createdAt)}
                      </span>
                    </span>

                    {isUnread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className={`${selectedConversationId ? "flex" : "hidden md:flex"} min-h-0 flex-col overflow-hidden`}>
          <ChatThreadPanel
            title={selectedConversation ? conversationTitle(selectedConversation) : ""}
            conversation={selectedConversation}
            messages={messages}
            loading={messagesLoading}
            error={messagesError}
            olderCursor={olderCursor}
            onLoadOlder={handleLoadOlderMessages}
            onSend={handleSend}
            canPost={canPost}
            currentUserId={currentUserId}
            onArchive={
              selectedConversation && selectedConversation.channelKind !== "group"
                ? handleArchive
                : undefined
            }
            onResolve={
              selectedConversation && RESOLVABLE_TYPES.has(selectedConversation.type) ? handleResolve : undefined
            }
            onBack={() => setSelectedConversationId(null)}
          />
        </div>
      </section>

      {showNewChatModal && activeTab === "academic_peer" && (
        <NewAcademicChatModal
          onClose={() => setShowNewChatModal(false)}
          onConversationStarted={handleConversationStarted}
        />
      )}

      {showNewChatModal && activeTab === "teacher_support" && (
        <NewTeacherQuestionModal
          onClose={() => setShowNewChatModal(false)}
          onConversationStarted={handleConversationStarted}
        />
      )}

      {showNewChatModal && activeTab === "administrative_support" && (
        <NewAdministrativeTicketModal
          onClose={() => setShowNewChatModal(false)}
          onConversationStarted={handleConversationStarted}
        />
      )}
    </main>
  );
}
