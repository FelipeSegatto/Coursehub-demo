import { useState } from "react";
import { reportMessage } from "../../services/ChatService";

const REASONS = [
  { value: "spam", label: "Spam" },
  { value: "abuse", label: "Abuso" },
  { value: "harassment", label: "Assédio" },
  { value: "inappropriate_content", label: "Conteúdo impróprio" },
  { value: "other", label: "Outro" },
];

export default function ReportMessageModal({ messageId, onClose, onReported }) {
  const [reason, setReason] = useState(REASONS[0].value);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      setSubmitting(true);
      setError("");

      await reportMessage(messageId, { reason, details: details.trim() });

      onReported();
    } catch (requestError) {
      setError(requestError.message || "Não foi possível reportar esta mensagem.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Reportar mensagem</h2>

          <button type="button" onClick={onClose} className="text-gray-400 transition hover:text-gray-600" aria-label="Fechar">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Motivo</label>
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
            >
              {REASONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Detalhes (opcional)</label>
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value.slice(0, 500))}
              rows={3}
              maxLength={500}
              placeholder="Descreva o problema, se quiser"
              className="w-full resize-none rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Enviando..." : "Reportar"}
          </button>
        </form>
      </div>
    </div>
  );
}
