import { useEffect, useState } from "react";
import { apiFetch } from "../../services/APIService";
import {
  createMaterial,
  updateMaterial,
  getScopeImpact,
} from "../../services/AdminContentService";
import { listClasses } from "../../services/AdminClassService";
import { uploadUserFile } from "../../services/ProfileService";
import FileUploadField from "../uploads/FileUploadField";

const TYPE_OPTIONS = [
  { value: "video", label: "Vídeo" },
  { value: "pdf", label: "PDF" },
  { value: "text", label: "Texto" },
  { value: "live_class", label: "Aula ao vivo" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" },
  { value: "draft", label: "Rascunho" },
  { value: "archived", label: "Arquivado" },
];

function requiresUrl(type) {
  return type === "video" || type === "live_class";
}

function acceptsUpload(type) {
  return type === "pdf";
}

function requiresText(type) {
  return type === "text";
}

function toDateTimeInputValue(value) {
  if (!value) return "";

  return String(value).slice(0, 16);
}

function AdminContentModal({ mode = "create", initialData = null, handleCloseModal, onSuccess }) {
  const isEditMode = mode === "edit";

  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [error, setError] = useState("");

  const [courses, setCourses] = useState([]);
  const [classes, setClasses] = useState([]);

  const [formData, setFormData] = useState({
    course_id: initialData?.course?.id ? String(initialData.course.id) : "",
    class_id: initialData?.class?.id ? String(initialData.class.id) : "",
    title: initialData?.title || "",
    description: initialData?.description || "",
    type: initialData?.type || "text",
    content_url: initialData?.contentUrl || "",
    content_text: initialData?.contentText || "",
    order_index: initialData?.orderIndex || 1,
    is_required: initialData?.isRequired ?? true,
    status: initialData?.status || "active",
    due_date: toDateTimeInputValue(initialData?.dueDate),
  });

  const [pendingScopeImpact, setPendingScopeImpact] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);

  useEffect(() => {
    let ignoreRequest = false;

    async function loadCourses() {
      try {
        setLoadingOptions(true);
        setError("");

        const response = await apiFetch("/api/admin/courses");

        if (!ignoreRequest) {
          setCourses(Array.isArray(response) ? response : []);
        }
      } catch (requestError) {
        if (ignoreRequest) return;

        console.error("Erro ao carregar cursos:", requestError);
        setError(requestError.message || "Não foi possível carregar os cursos.");
      } finally {
        if (!ignoreRequest) setLoadingOptions(false);
      }
    }

    loadCourses();

    return () => {
      ignoreRequest = true;
    };
  }, []);

  useEffect(() => {
    if (!formData.course_id) {
      setClasses([]);
      return;
    }

    let ignoreRequest = false;

    async function loadClasses() {
      try {
        const response = await listClasses({ courseId: formData.course_id, limit: 100 });

        if (!ignoreRequest) {
          setClasses(Array.isArray(response?.data) ? response.data : []);
        }
      } catch (requestError) {
        if (!ignoreRequest) {
          console.error("Erro ao carregar turmas do curso:", requestError);
        }
      }
    }

    loadClasses();

    return () => {
      ignoreRequest = true;
    };
  }, [formData.course_id]);

  function handleChange(event) {
    const { name, value, type: inputType, checked } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: inputType === "checkbox" ? checked : value,
    }));
  }

  function validateForm() {
    if (!isEditMode && !formData.course_id) return "Selecione um curso.";
    if (!formData.title.trim()) return "O título é obrigatório.";

    if (requiresUrl(formData.type) && !formData.content_url.trim()) {
      return "A URL é obrigatória para este tipo de material.";
    }

    if (
      acceptsUpload(formData.type) &&
      !selectedFile &&
      !formData.content_url.trim()
    ) {
      return "Envie um arquivo PDF ou informe a URL do material.";
    }

    if (requiresText(formData.type) && !formData.content_text.trim()) {
      return "O texto do conteúdo é obrigatório para este tipo de material.";
    }

    if (formData.type === "live_class" && formData.due_date) {
      return "Aulas ao vivo não podem ter prazo.";
    }

    return "";
  }

  function buildPayload() {
    const payload = {
      title: formData.title.trim(),
      description: formData.description.trim() || null,
      type: formData.type,
      content_url: formData.content_url.trim() || null,
      content_text: formData.content_text.trim() || null,
      order_index: Number(formData.order_index) || 1,
      is_required: Boolean(formData.is_required),
      status: formData.status,
      due_date: formData.due_date ? `${formData.due_date}:00` : null,
      class_id: formData.class_id ? Number(formData.class_id) : null,
    };

    if (!isEditMode) {
      payload.course_id = Number(formData.course_id);
    }

    return payload;
  }

  async function submitSave() {
    try {
      setLoading(true);
      setError("");

      const payload = buildPayload();

      if (selectedFile) {
        const uploaded = await uploadUserFile(selectedFile, "course_material");
        payload.file_id = uploaded.file.id;
      }

      const result = isEditMode
        ? await updateMaterial(initialData.id, payload)
        : await createMaterial(payload);

      await onSuccess?.(result);
    } catch (requestError) {
      console.error("Erro ao salvar material:", requestError);
      setError(requestError.message || "Erro ao salvar material.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (loading || loadingImpact) return;

    setError("");

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    const originalClassId = initialData?.class?.id ? String(initialData.class.id) : "";

    // Mudança de escopo (geral<->turma ou turma<->outra) exige uma
    // confirmação forte mostrando impacto real antes de salvar —
    // nunca aplicada silenciosamente.
    if (isEditMode && originalClassId !== formData.class_id) {
      try {
        setLoadingImpact(true);

        const impact = await getScopeImpact(
          initialData.id,
          formData.class_id || undefined
        );

        setPendingScopeImpact(impact);
      } catch (requestError) {
        console.error("Erro ao calcular impacto de escopo:", requestError);
        setError(
          requestError.message || "Não foi possível calcular o impacto da mudança."
        );
      } finally {
        setLoadingImpact(false);
      }

      return;
    }

    await submitSave();
  }

  async function handleConfirmScopeChange() {
    setPendingScopeImpact(null);
    await submitSave();
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500";
  const labelClass = "block text-sm font-medium text-gray-700";
  const isBusy = loading || loadingOptions || loadingImpact;

  if (pendingScopeImpact) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
          <h2 className="text-xl font-bold text-gray-900">Confirmar mudança de escopo</h2>

          <p className="mt-3 text-sm text-gray-600">
            Esta mudança altera imediatamente quem pode visualizar este material.
          </p>

          <ul className="mt-4 space-y-1 text-sm text-gray-700">
            <li>Alunos que perderão acesso: {pendingScopeImpact.studentsLosingAccess}</li>
            <li>Alunos que passarão a ter acesso: {pendingScopeImpact.studentsGainingAccess}</li>
            <li>
              Registros de progresso que ficarão fora do novo escopo:{" "}
              {pendingScopeImpact.existingProgressOutsideNewScope}
            </li>
          </ul>

          <p className="mt-4 text-xs text-gray-500">
            Nenhum progresso é apagado — os registros acima continuam existindo,
            só deixam de corresponder ao escopo atual do material.
          </p>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setPendingScopeImpact(null)}
              disabled={loading}
              className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-60"
            >
              Voltar
            </button>

            <button
              type="button"
              onClick={handleConfirmScopeChange}
              disabled={loading}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "Salvando..." : "Confirmar mudança"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
        <button
          type="button"
          onClick={handleCloseModal}
          disabled={isBusy}
          className="absolute right-4 top-4 z-10 rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ✕
        </button>

        <div className="shrink-0 border-b border-gray-200 px-6 py-5 pr-14">
          <h2 className="text-xl font-bold text-gray-900">
            {isEditMode ? "Editar material" : "Cadastrar material"}
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            {isEditMode
              ? "Altere os dados abaixo para atualizar este material."
              : "Preencha os dados abaixo para criar um novo material."}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 space-y-5 overflow-y-auto px-6 py-6"
        >
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </p>
          )}

          <label className={labelClass}>
            Título
            <input
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            Descrição
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows="2"
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            Curso
            <select
              name="course_id"
              value={formData.course_id}
              onChange={handleChange}
              required
              disabled={isEditMode || loadingOptions}
              className={inputClass}
            >
              <option value="">
                {loadingOptions ? "Carregando cursos..." : "Selecione um curso"}
              </option>

              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>

            {isEditMode && (
              <span className="mt-1 block text-xs text-gray-400">
                O curso de um material não pode ser alterado após a criação.
              </span>
            )}
          </label>

          <label className={labelClass}>
            Turma (opcional — vazio = geral, visível para o curso inteiro)
            <select
              name="class_id"
              value={formData.class_id}
              onChange={handleChange}
              disabled={!formData.course_id}
              className={inputClass}
            >
              <option value="">Geral (todas as turmas do curso)</option>

              {classes.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name}
                </option>
              ))}
            </select>
          </label>

          <label className={labelClass}>
            Tipo
            <select
              name="type"
              value={formData.type}
              onChange={handleChange}
              className={inputClass}
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {acceptsUpload(formData.type) && (
            <FileUploadField
              purpose="course_material"
              file={selectedFile}
              onFileChange={setSelectedFile}
              label="Arquivo"
              disabled={isBusy}
              inputClass={inputClass}
            />
          )}

          {(requiresUrl(formData.type) || acceptsUpload(formData.type)) && (
            <label className={labelClass}>
              {acceptsUpload(formData.type) ? "URL (opcional, se não enviar arquivo)" : "URL"}
              <input
                name="content_url"
                value={formData.content_url}
                onChange={handleChange}
                placeholder="https://..."
                className={inputClass}
              />
            </label>
          )}

          {requiresText(formData.type) && (
            <label className={labelClass}>
              Texto do conteúdo
              <textarea
                name="content_text"
                value={formData.content_text}
                onChange={handleChange}
                rows="4"
                className={inputClass}
              />
            </label>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className={labelClass}>
              Ordem
              <input
                type="number"
                name="order_index"
                value={formData.order_index}
                onChange={handleChange}
                min="1"
                className={inputClass}
              />
            </label>

            <label className={labelClass}>
              Status
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className={inputClass}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {formData.type !== "live_class" && (
            <label className={labelClass}>
              Prazo (opcional)
              <input
                type="datetime-local"
                name="due_date"
                value={formData.due_date}
                onChange={handleChange}
                className={inputClass}
              />
            </label>
          )}

          {formData.type === "live_class" && (
            <p className="text-xs text-gray-400">
              Aulas ao vivo não têm prazo — o encontro é controlado pela turma
              (frequência/sessões).
            </p>
          )}

          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              name="is_required"
              checked={Boolean(formData.is_required)}
              onChange={handleChange}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Obrigatório
          </label>

          <div className="sticky bottom-0 -mx-6 flex justify-end gap-3 border-t border-gray-200 bg-white px-6 py-4">
            <button
              type="button"
              onClick={handleCloseModal}
              disabled={isBusy}
              className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isBusy}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 hover:shadow-lg disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {loadingImpact
                ? "Calculando impacto..."
                : loading
                  ? "Salvando..."
                  : isEditMode
                    ? "Salvar alterações"
                    : "Salvar material"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AdminContentModal;
