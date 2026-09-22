import {
  useEffect,
  useState,
} from "react";

const sessionTypeOptions = [
  {
    value: "class",
    label: "Aula",
  },
  {
    value: "review",
    label: "Revisão",
  },
  {
    value: "exam",
    label: "Prova",
  },
  {
    value: "presentation",
    label: "Apresentação",
  },
  {
    value: "workshop",
    label: "Workshop",
  },
  {
    value: "lab",
    label: "Laboratório",
  },
  {
    value: "recovery",
    label: "Recuperação",
  },
  {
    value: "other",
    label: "Outro",
  },
];

const sessionStatusOptions = [
  {
    value: "scheduled",
    label: "Agendado",
  },
  {
    value: "completed",
    label: "Concluído",
  },
  {
    value: "cancelled",
    label: "Cancelado",
  },
];

const initialSessionForm = {
  sessionNumber: "",
  title: "",
  sessionDate: "",
  startTime: "",
  endTime: "",
  sessionType: "class",
  description: "",
  status: "scheduled",
};

function formatDateInputValue(dateValue) {
  if (!dateValue) {
    return "";
  }

  return String(dateValue).split("T")[0];
}

function formatTimeInputValue(timeValue) {
  if (!timeValue) {
    return "";
  }

  return String(timeValue).slice(0, 5);
}

function createInitialForm({
  session,
  nextSessionNumber,
}) {
  if (!session) {
    return {
      ...initialSessionForm,
      sessionNumber: String(
        nextSessionNumber || 1
      ),
    };
  }

  return {
    sessionNumber: String(
      session.sessionNumber ??
        session.session_number ??
        ""
    ),

    title: session.title || "",

    sessionDate: formatDateInputValue(
      session.sessionDate ??
        session.session_date
    ),

    startTime: formatTimeInputValue(
      session.startTime ??
        session.start_time
    ),

    endTime: formatTimeInputValue(
      session.endTime ??
        session.end_time
    ),

    sessionType:
      session.sessionType ??
      session.session_type ??
      "class",

    description:
      session.description || "",

    status:
      session.status || "scheduled",
  };
}

function validateSessionForm(form) {
  const sessionNumber = Number(
    form.sessionNumber
  );

  if (
    !Number.isInteger(sessionNumber) ||
    sessionNumber <= 0
  ) {
    return "Informe um número válido para o encontro.";
  }

  if (!form.title.trim()) {
    return "Informe o título do encontro.";
  }

  if (!form.sessionDate) {
    return "Informe a data do encontro.";
  }

  if (
    form.startTime &&
    form.endTime &&
    form.endTime <= form.startTime
  ) {
    return "O horário final deve ser posterior ao horário inicial.";
  }

  return "";
}

function createSessionPayload(form) {
  return {
    sessionNumber: Number(
      form.sessionNumber
    ),

    title: form.title.trim(),

    sessionDate:
      form.sessionDate,

    startTime:
      form.startTime || null,

    endTime:
      form.endTime || null,

    sessionType:
      form.sessionType,

    description:
      form.description.trim() ||
      null,

    status:
      form.status,
  };
}

function getErrorMessage(error) {
  return (
    error?.message ||
    "Não foi possível salvar o encontro."
  );
}

/**
 * Formulário compartilhado de encontro (professor e admin usam o
 * mesmo componente, mesma validação, mesmos campos) -- quem chama
 * decide COMO salvar via onSubmit, este componente nunca sabe se
 * quem está salvando é o professor dono da turma ou um administrador.
 * onSubmit(payload, {isEditing, session, classId}) => Promise<savedSession>
 */
export default function SessionModal({
  open,
  classId,
  session = null,
  nextSessionNumber = 1,
  onClose,
  onSaved,
  onSubmit,
}) {
  const [form, setForm] = useState(
    initialSessionForm
  );

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const isEditing = Boolean(
    session?.id
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm(
      createInitialForm({
        session,
        nextSessionNumber,
      })
    );

    setError("");
  }, [
    open,
    session,
    nextSessionNumber,
  ]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (
        event.key === "Escape" &&
        !saving
      ) {
        onClose?.();
      }
    }

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    open,
    saving,
    onClose,
  ]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    return () => {
      document.body.style.overflow =
        previousOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  function handleChange(event) {
    const { name, value } =
      event.target;

    setForm((currentForm) => ({
      ...currentForm,
      [name]: value,
    }));

    if (error) {
      setError("");
    }
  }

  function handleClose() {
    if (saving) {
      return;
    }

    setError("");
    onClose?.();
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!classId && !isEditing) {
      setError(
        "Não foi possível identificar a turma."
      );

      return;
    }

    const validationError =
      validateSessionForm(form);

    if (validationError) {
      setError(validationError);
      return;
    }

    const payload =
      createSessionPayload(form);

    try {
      setSaving(true);
      setError("");

      const data = await onSubmit(payload, {
        isEditing,
        session,
        classId,
      });

      const savedSession =
        data?.session;

      if (!savedSession) {
        throw new Error(
          "A API não retornou os dados do encontro salvo."
        );
      }

      await onSaved?.(
        savedSession,
        {
          mode: isEditing
            ? "edit"
            : "create",
        }
      );

      handleClose();
    } catch (saveError) {
      console.error(
        "Erro ao salvar encontro:",
        saveError
      );

      setError(
        getErrorMessage(
          saveError
        )
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-modal-title"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          handleClose();
        }
      }}
    >
      <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-gray-100 p-6">
          <div>
            <h2
              id="session-modal-title"
              className="text-2xl font-bold text-gray-900"
            >
              {isEditing
                ? "Editar encontro"
                : "Novo encontro"}
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {isEditing
                ? "Atualize as informações do encontro selecionado."
                : "Cadastre uma aula, prova, revisão ou outro encontro da turma."}
            </p>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="rounded-lg px-3 py-2 text-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Fechar modal"
          >
            ×
          </button>
        </header>

        <form
          onSubmit={handleSubmit}
          className="space-y-5 p-6"
        >
          {error && (
            <div
              className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
              role="alert"
            >
              {error}
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-3">
            <FormField
              label="Número"
              htmlFor="sessionNumber"
            >
              <input
                id="sessionNumber"
                name="sessionNumber"
                type="number"
                min="1"
                step="1"
                value={
                  form.sessionNumber
                }
                onChange={
                  handleChange
                }
                disabled={saving}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
                required
              />
            </FormField>

            <div className="sm:col-span-2">
              <FormField
                label="Título"
                htmlFor="title"
              >
                <input
                  id="title"
                  name="title"
                  type="text"
                  maxLength="180"
                  value={form.title}
                  onChange={
                    handleChange
                  }
                  disabled={saving}
                  placeholder="Ex.: Introdução ao React"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
                  required
                />
              </FormField>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <FormField
              label="Data"
              htmlFor="sessionDate"
            >
              <input
                id="sessionDate"
                name="sessionDate"
                type="date"
                value={
                  form.sessionDate
                }
                onChange={
                  handleChange
                }
                disabled={saving}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
                required
              />
            </FormField>

            <FormField
              label="Horário inicial"
              htmlFor="startTime"
            >
              <input
                id="startTime"
                name="startTime"
                type="time"
                value={
                  form.startTime
                }
                onChange={
                  handleChange
                }
                disabled={saving}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
              />
            </FormField>

            <FormField
              label="Horário final"
              htmlFor="endTime"
            >
              <input
                id="endTime"
                name="endTime"
                type="time"
                value={
                  form.endTime
                }
                onChange={
                  handleChange
                }
                disabled={saving}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
              />
            </FormField>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label="Tipo de encontro"
              htmlFor="sessionType"
            >
              <select
                id="sessionType"
                name="sessionType"
                value={
                  form.sessionType
                }
                onChange={
                  handleChange
                }
                disabled={saving}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
              >
                {sessionTypeOptions.map(
                  (option) => (
                    <option
                      key={
                        option.value
                      }
                      value={
                        option.value
                      }
                    >
                      {option.label}
                    </option>
                  )
                )}
              </select>
            </FormField>

            <FormField
              label="Status"
              htmlFor="status"
            >
              <select
                id="status"
                name="status"
                value={form.status}
                onChange={
                  handleChange
                }
                disabled={saving}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
              >
                {sessionStatusOptions.map(
                  (option) => (
                    <option
                      key={
                        option.value
                      }
                      value={
                        option.value
                      }
                    >
                      {option.label}
                    </option>
                  )
                )}
              </select>
            </FormField>
          </div>

          <FormField
            label="Descrição"
            htmlFor="description"
          >
            <textarea
              id="description"
              name="description"
              rows="4"
              maxLength="1000"
              value={
                form.description
              }
              onChange={
                handleChange
              }
              disabled={saving}
              placeholder="Conteúdo previsto, observações ou objetivos do encontro..."
              className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
            />
          </FormField>

          <footer className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ? "Salvando..."
                : isEditing
                  ? "Salvar alterações"
                  : "Criar encontro"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function FormField({
  label,
  htmlFor,
  children,
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-sm font-semibold text-gray-700"
      >
        {label}
      </label>

      {children}
    </div>
  );
}