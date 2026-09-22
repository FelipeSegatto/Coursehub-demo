import { useState } from "react";
import ReportMessageModal from "./ReportMessageModal";

function formatTime(value) {
  if (!value) return "";

  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatMessageBubble({ message, isOwn }) {
  const [showReportModal, setShowReportModal] = useState(false);
  const [reported, setReported] = useState(false);

  if (message.messageType === "system") {
    return (
      <div className="my-2 text-center text-xs text-gray-500">
        {message.body}
      </div>
    );
  }

  const canReport = !isOwn && !message.isDeleted && !message.pending;

  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[75%] ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
        <div
          className={`rounded-2xl px-4 py-2 ${
            isOwn ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900"
          } ${message.pending ? "opacity-60" : ""} ${message.failed ? "border border-red-400" : ""}`}
        >
          {!isOwn && <p className="mb-0.5 text-xs font-semibold text-gray-500">{message.senderName}</p>}

          {message.isDeleted ? (
            <p className={`text-sm italic ${isOwn ? "text-blue-100" : "text-gray-400"}`}>
              Mensagem removida.
            </p>
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
          )}

          <p className={`mt-1 text-right text-[10px] ${isOwn ? "text-blue-100" : "text-gray-400"}`}>
            {message.failed ? "Falha ao enviar" : message.pending ? "Enviando..." : formatTime(message.createdAt)}
          </p>
        </div>

        {canReport && (
          <button
            type="button"
            onClick={() => setShowReportModal(true)}
            disabled={reported}
            className="mt-0.5 text-[10px] text-gray-400 transition hover:text-red-600 disabled:cursor-not-allowed disabled:hover:text-gray-400"
          >
            {reported ? "Reportado" : "Reportar"}
          </button>
        )}
      </div>

      {showReportModal && (
        <ReportMessageModal
          messageId={message.messageId}
          onClose={() => setShowReportModal(false)}
          onReported={() => {
            setShowReportModal(false);
            setReported(true);
          }}
        />
      )}
    </div>
  );
}
