import { useState } from "react";
import { openStaffTicket } from "../../services/ChatService";

const CATEGORIES = [
  { value: "course", label: "Curso" },
  { value: "class", label: "Turma" },
  { value: "schedule", label: "Agenda" },
  { value: "administrative", label: "Administrativo" },
  { value: "other", label: "Outro" },
];

export default function NewStaffTicketModal({ onClose, onConversationStarted }) {
  const [category, setCategory] = useState(CATEGORIES[0].value);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    if (!subject.trim() || !body.trim()) return;

    try {
      setSubmitting(true);
      setError("");

      const result = await openStaffTicket({ category, subject: subject.trim(), body: body.trim() });

      onConversationStarted(result.conversationId);
    } catch (requestError) {
      setError(requestError.message || "Não foi possível abrir o protocolo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Novo protocolo com a administração</h2>

          <button type="button" onClick={onClose} className="text-gray-400 transition hover:text-gray-600" aria-label="Fechar">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Categoria</label>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
            >
              {CATEGORIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Assunto</label>
            <input
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value.slice(0, 180))}
              placeholder="Resumo da sua solicitação"
              maxLength={180}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Mensagem</label>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value.slice(0, 4000))}
              rows={4}
              maxLength={4000}
              placeholder="Descreva sua solicitação em detalhes..."
              className="w-full resize-none rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !subject.trim() || !body.trim()}
            className="w-full rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Enviando..." : "Enviar protocolo"}
          </button>
        </form>
      </div>
    </div>
  );
}
