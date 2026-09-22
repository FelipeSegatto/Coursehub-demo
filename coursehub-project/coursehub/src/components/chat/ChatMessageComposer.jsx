import { useState } from "react";

const MAX_LENGTH = 4000;

export default function ChatMessageComposer({ onSend, disabled = false, disabledReason = "" }) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    const trimmed = value.trim();

    if (!trimmed || sending || disabled) return;

    setSending(true);
    setValue("");

    try {
      await onSend(trimmed);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(event);
    }
  }

  if (disabled) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center text-sm text-gray-500">
        {disabledReason || "Você não pode enviar mensagens nesta conversa."}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value.slice(0, MAX_LENGTH))}
        onKeyDown={handleKeyDown}
        rows={2}
        maxLength={MAX_LENGTH}
        placeholder="Escreva uma mensagem..."
        className="flex-1 resize-none rounded-xl border border-gray-300 p-3 text-sm focus:border-blue-500 focus:outline-none"
      />

      <button
        type="submit"
        disabled={!value.trim() || sending}
        className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Enviar
      </button>
    </form>
  );
}
