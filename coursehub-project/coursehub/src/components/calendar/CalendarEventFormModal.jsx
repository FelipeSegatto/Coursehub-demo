import { useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { apiFetch } from "../../services/APIService";

const EVENT_TYPE_OPTIONS = [
  { value: "holiday", label: "Feriado" },
  { value: "break", label: "Férias" },
  { value: "recess", label: "Recesso" },
  { value: "exam_week", label: "Semana de provas" },
  { value: "academic_week", label: "Semana acadêmica" },
  { value: "enrollment", label: "Matrícula" },
  { value: "re_enrollment", label: "Rematrícula" },
  { value: "grade_deadline", label: "Prazo de lançamento de notas" },
  { value: "academic_meeting", label: "Reunião acadêmica" },
  { value: "institutional", label: "Evento institucional" },
];

const SCOPE_TYPE_OPTIONS = [
  { value: "institutional", label: "Institucional (todos)" },
  { value: "all_students", label: "Todos os alunos" },
  { value: "all_teachers", label: "Todos os professores" },
  { value: "course", label: "Um curso específico" },
  { value: "class", label: "Uma turma específica" },
];

const EMPTY_FORM = {
  event_type: "institutional",
  title: "",
  description: "",
  start_date: "",
  end_date: "",
  all_day: true,
  start_time: "",
  end_time: "",
  scope_type: "institutional",
  course_id: "",
  class_id: "",
};

function buildInitialFormData(mode, initialData) {
  if (mode === "edit" && initialData) {
    return {
      event_type:
        initialData.event_type || initialData.indicatorType || "institutional",
      title: initialData.title || "",
      description: initialData.description || "",
      start_date: initialData.startDate || "",
      end_date: initialData.endDate || "",
      all_day: initialData.allDay ?? true,
      start_time: initialData.startTime || "",
      end_time: initialData.endTime || "",
      scope_type: initialData.scope_type || "institutional",
      course_id: initialData.courseId ?? "",
      class_id: initialData.classId ?? "",
    };
  }

  return EMPTY_FORM;
}

export default function CalendarEventFormModal({
  open,
  mode = "create",
  initialData = null,
  onClose,
  onSuccess,
}) {
  /*
    O modal só existe montado enquanto está aberto (o pai só
    renderiza <CalendarEventFormModal> quando há formModal) — então
    o estado inicial já nasce correto a partir de mode/initialData,
    sem precisar de um useEffect pra "resetar" o formulário.
  */
  const [formData, setFormData] = useState(() =>
    buildInitialFormData(mode, initialData)
  );
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/api/admin/courses")
      .then((data) => setCourses(Array.isArray(data) ? data : []))
      .catch(() => setCourses([]));
  }, []);

  const needsCourse = formData.scope_type === "course" || formData.scope_type === "class";
  const needsClass = formData.scope_type === "class";

  function updateField(field, value) {
    setFormData((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSubmit(submitEvent) {
    submitEvent.preventDefault();

    try {
      setLoading(true);
      setError("");

      const payload = {
        event_type: formData.event_type,
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        start_date: formData.start_date,
        end_date: formData.end_date || null,
        all_day: formData.all_day,
        start_time: formData.all_day ? null : formData.start_time || null,
        end_time: formData.all_day ? null : formData.end_time || null,
        scope_type: formData.scope_type,
        course_id: needsCourse ? formData.course_id || null : null,
        class_id: needsClass ? formData.class_id || null : null,
      };

      if (mode === "edit" && initialData) {
        await apiFetch(`/api/admin/calendar/events/${initialData.sourceId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/api/admin/calendar/events", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      onSuccess?.();
      onClose();
    } catch (submitError) {
      setError(
        submitError.data?.message ||
          submitError.message ||
          "Não foi possível salvar o evento."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />

        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-lg font-bold text-gray-900">
              {mode === "edit" ? "Editar evento" : "Novo evento acadêmico"}
            </Dialog.Title>

            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Fechar"
                className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <div>
              <label className="text-sm font-medium text-gray-700">Título</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(event) => updateField("title", event.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Descrição</label>
              <textarea
                rows={3}
                value={formData.description}
                onChange={(event) => updateField("description", event.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Tipo</label>
                <select
                  value={formData.event_type}
                  onChange={(event) => updateField("event_type", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  {EVENT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Público-alvo</label>
                <select
                  value={formData.scope_type}
                  onChange={(event) => updateField("scope_type", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  {SCOPE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {needsCourse && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Curso</label>
                  <select
                    required
                    value={formData.course_id}
                    onChange={(event) => updateField("course_id", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Selecione...</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.name}
                      </option>
                    ))}
                  </select>
                </div>

                {needsClass && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">
                      ID da turma
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={formData.class_id}
                      onChange={(event) => updateField("class_id", event.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                    <p className="mt-1 text-xs text-gray-400">
                      Consulte o ID na página de detalhes da turma.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Data inicial</label>
                <input
                  type="date"
                  required
                  value={formData.start_date}
                  onChange={(event) => updateField("start_date", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Data final (opcional)
                </label>
                <input
                  type="date"
                  value={formData.end_date}
                  onChange={(event) => updateField("end_date", event.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={formData.all_day}
                onChange={(event) => updateField("all_day", event.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Dia inteiro
            </label>

            {!formData.all_day && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Início</label>
                  <input
                    type="time"
                    value={formData.start_time}
                    onChange={(event) => updateField("start_time", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Fim</label>
                  <input
                    type="time"
                    value={formData.end_time}
                    onChange={(event) => updateField("end_time", event.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {loading ? "Salvando..." : "Salvar evento"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
