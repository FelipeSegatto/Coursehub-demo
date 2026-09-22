import { useEffect, useState } from "react";
import { listActiveTeachersForChat, openStaffConversation } from "../../services/ChatService";

const CATEGORIES = [
  { value: "course", label: "Curso" },
  { value: "class", label: "Turma" },
  { value: "schedule", label: "Agenda" },
  { value: "administrative", label: "Administrativo" },
  { value: "other", label: "Outro" },
];

export default function NewStaffConversationModal({ onClose, onConversationStarted }) {
  const [teachers, setTeachers] = useState([]);
  const [teachersLoading, setTeachersLoading] = useState(true);
  const [teachersError, setTeachersError] = useState("");

  const [teacherUserId, setTeacherUserId] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0].value);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function fetchTeachers() {
      try {
        const result = await listActiveTeachersForChat();

        if (cancelled) return;

        setTeachers(result);
      } catch (requestError) {
        if (cancelled) return;

        setTeachersError(requestError.message || "Não foi possível carregar os professores.");
      } finally {
        if (!cancelled) setTeachersLoading(false);
      }
    }

    fetchTeachers();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!teacherUserId || !subject.trim() || !body.trim()) return;

    try {
      setSubmitting(true);
      setError("");

      const result = await openStaffConversation({
        teacherUserId: Number(teacherUserId),
        category,
        subject: subject.trim(),
        body: body.trim(),
      });

      onConversationStarted(result.conversationId);
    } catch (requestError) {
      setError(requestError.message || "Não foi possível iniciar a conversa.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Nova conversa com professor</h2>

          <button type="button" onClick={onClose} className="text-gray-400 transition hover:text-gray-600" aria-label="Fechar">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Professor</label>
            {teachersLoading && <p className="text-sm text-gray-500">Carregando professores...</p>}
            {!teachersLoading && teachersError && <p className="text-sm text-red-700">{teachersError}</p>}
            {!teachersLoading && !teachersError && (
              <select
                value={teacherUserId}
                onChange={(event) => setTeacherUserId(event.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">Selecione um professor</option>
                {teachers.map((teacher) => (
                  <option key={teacher.user_id} value={teacher.user_id}>
                    {teacher.name}
                  </option>
                ))}
              </select>
            )}
          </div>

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
              placeholder="Resumo do assunto"
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
              placeholder="Descreva o assunto em detalhes..."
              className="w-full resize-none rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !teacherUserId || !subject.trim() || !body.trim()}
            className="w-full rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Enviando..." : "Iniciar conversa"}
          </button>
        </form>
      </div>
    </div>
  );
}
