import { useEffect, useState } from "react";
import { apiFetch } from "../../services/APIService";
import { uploadUserFile } from "../../services/ProfileService";
import FileUploadField from "../uploads/FileUploadField";

function ContentModal({
  mode = "create",
  variant = "content",
  courses = [],
  classes = [],
  courseId = null,
  content = null,
  userId,
  handleCloseModal,
  onSuccess,
}) {
  const isEditMode = mode === "edit";
  const isContentVariant = variant === "content";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);

  const [formData, setFormData] = useState({
    course_id: courseId ? String(courseId) : "",
    class_id: "",
    title: "",
    description: "",
    type: "video",
    content_text: "",
    content_url: "",
    order_index: 1,
    is_required: true,
    status: "active",
  });

  /*
   * Turmas do curso atualmente selecionado no formulário.
   * A turma só pode ser escolhida depois que um curso é
   * selecionado, e a lista se recalcula ao trocar de curso.
   */
  const classesForSelectedCourse = formData.course_id
    ? classes.filter(
        (classItem) =>
          String(classItem.courseId ?? classItem.course_id) ===
          String(formData.course_id)
      )
    : [];

  const modalTitle = isEditMode
    ? isContentVariant
      ? "Editar conteúdo"
      : "Editar atividade"
    : isContentVariant
      ? "Cadastrar novo conteúdo"
      : "Cadastrar nova atividade";

  const modalDescription = isEditMode
    ? isContentVariant
      ? "Altere os dados abaixo para atualizar este conteúdo."
      : "Altere os dados abaixo para atualizar esta atividade."
    : isContentVariant
      ? "Preencha os dados abaixo para adicionar um novo conteúdo ao curso."
      : "Preencha os dados abaixo para adicionar uma nova atividade ao curso.";

  const submitButtonText = loading
    ? "Salvando..."
    : isEditMode
      ? "Salvar alterações"
      : isContentVariant
        ? "Salvar conteúdo"
        : "Salvar atividade";

  /*
   * Preenche o formulário ao abrir no modo de edição.
   */
  useEffect(() => {
    if (!isEditMode || !content) {
      return;
    }

    console.log(
      "Conteúdo recebido para edição:",
      content
    );

    const editingClassId =
      content.classId ?? content.class_id ?? null;

    setFormData({
      course_id:
        content.course_id !== null &&
        content.course_id !== undefined
          ? String(content.course_id)
          : "",
      class_id:
        editingClassId !== null && editingClassId !== undefined
          ? String(editingClassId)
          : "",
      title: content.title || "",
      description: content.description || "",
      type: content.type || "video",
      content_text: content.content_text || "",
      content_url: content.content_url || "",
      order_index:
        content.order_index !== null &&
        content.order_index !== undefined
          ? content.order_index
          : 1,
      is_required:
        content.is_required === true ||
        content.is_required === 1 ||
        content.is_required === "1",
      status: content.status || "active",
    });
  }, [isEditMode, content]);

  /*
   * Usa courseId como curso inicial no modo de criação,
   * quando ele for informado.
   */
  useEffect(() => {
    if (isEditMode || !courseId) {
      return;
    }

    setFormData((previousFormData) => ({
      ...previousFormData,
      course_id: String(courseId),
    }));
  }, [isEditMode, courseId]);

  function handleChange(event) {
    const {
      name,
      value,
      type,
      checked,
    } = event.target;

    setFormData((previousFormData) => ({
      ...previousFormData,
      [name]:
        type === "checkbox"
          ? checked
          : value,

      /*
       * Trocar de curso invalida a turma escolhida — as turmas
       * disponíveis são recalculadas para o novo curso.
       */
      ...(name === "course_id" ? { class_id: "" } : {}),
    }));
  }

  function validateForm() {
    if (!userId) {
      return "Usuário do professor não encontrado.";
    }

    if (!formData.course_id) {
      return "Selecione um curso.";
    }

    if (!formData.title.trim()) {
      return "Digite o título do conteúdo.";
    }

    if (
      !Number.isInteger(
        Number(formData.order_index)
      ) ||
      Number(formData.order_index) <= 0
    ) {
      return "A ordem deve ser um número inteiro maior que zero.";
    }

    const allowedTypes = [
      "video",
      "pdf",
      "text",
      "live_class",
    ];

    if (!allowedTypes.includes(formData.type)) {
      return "Tipo de conteúdo inválido.";
    }

    const allowedStatuses = [
      "active",
      "inactive",
      "draft",
      "archived",
    ];

    if (!allowedStatuses.includes(formData.status)) {
      return "Status do conteúdo inválido.";
    }

    if (
      formData.type === "pdf" &&
      !selectedFile &&
      !formData.content_url.trim()
    ) {
      return "Envie um arquivo PDF ou informe a URL do material.";
    }

    if (
      (formData.type === "video" || formData.type === "live_class") &&
      !formData.content_url.trim()
    ) {
      return "Informe a URL do conteúdo.";
    }

    return "";
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (loading) return;

    setError("");

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    const payload = {
      userId: Number(userId),
      course_id: Number(formData.course_id),
      class_id: formData.class_id
        ? Number(formData.class_id)
        : null,
      title: formData.title.trim(),
      description:
        formData.description.trim() || null,
      type: formData.type,
      content_text:
        formData.content_text.trim() || null,
      content_url:
        formData.content_url.trim() || null,
      order_index: Number(
        formData.order_index
      ),
      is_required: Boolean(
        formData.is_required
      ),
      status: formData.status,
    };

    if (selectedFile) {
      try {
        setLoading(true);
        const uploaded = await uploadUserFile(selectedFile, "course_material");
        payload.file_id = uploaded.file.id;
      } catch (uploadError) {
        setLoading(false);
        setError(uploadError.message || "Não foi possível enviar o arquivo.");
        return;
      }
    }

    const endpoint = isEditMode
      ? `/api/course-contents/${content.id}`
      : "/api/course-contents";

    const method = isEditMode
      ? "PUT"
      : "POST";

    try {
      setLoading(true);

      console.log(
        "Iniciando salvamento de conteúdo:",
        {
          mode,
          method,
          endpoint,
          contentId: content?.id,
          payload,
        }
      );

      const savedContent = await apiFetch(
        endpoint,
        {
          method,
          body: JSON.stringify(payload),
        }
      );

      console.log(
        "Conteúdo salvo com sucesso:",
        savedContent
      );

      await onSuccess?.(savedContent);
    } catch (error) {
      console.error(
        "Erro completo ao salvar conteúdo:",
        {
          message: error.message,
          stack: error.stack,
          mode,
          endpoint,
          contentId: content?.id,
          payload,
        }
      );

      setError(
        error.message ||
          "Não foi possível salvar o conteúdo."
      );
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500";

  const labelClass =
    "block text-sm font-medium text-gray-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
        <button
          type="button"
          onClick={handleCloseModal}
          disabled={loading}
          className="absolute right-4 top-4 z-10 rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ✕
        </button>

        <div className="shrink-0 border-b border-gray-200 px-6 py-5 pr-14">
          <h2 className="text-xl font-bold text-gray-900">
            {modalTitle}
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            {modalDescription}
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
            Curso

            <select
              name="course_id"
              value={formData.course_id}
              onChange={handleChange}
              required
              className={inputClass}
            >
              <option value="">
                Selecione um curso
              </option>

              {courses.map((course) => (
                <option
                  key={course.id}
                  value={course.id}
                >
                  {course.name}
                </option>
              ))}
            </select>

            {courses.length === 0 && (
              <p className="mt-2 text-xs font-medium text-red-600">
                Nenhum curso foi encontrado para este professor.
              </p>
            )}
          </label>

          <label className={labelClass}>
            Turma

            <select
              name="class_id"
              value={formData.class_id}
              onChange={handleChange}
              disabled={!formData.course_id}
              className={inputClass}
            >
              <option value="">
                Todas as turmas do curso
              </option>

              {classesForSelectedCourse.map((classItem) => (
                <option
                  key={classItem.id}
                  value={classItem.id}
                >
                  {classItem.name}
                </option>
              ))}
            </select>

            {!formData.course_id && (
              <p className="mt-2 text-xs text-gray-500">
                Selecione um curso para escolher uma turma.
              </p>
            )}
          </label>

          <label className={labelClass}>
            Título

            <input
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
              placeholder="Dê um título para o conteúdo"
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            Descrição

            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows="3"
              placeholder="Breve descrição do conteúdo..."
              className={inputClass}
            />
          </label>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className={labelClass}>
              Tipo

              <select
                name="type"
                value={formData.type}
                onChange={handleChange}
                className={inputClass}
              >
                <option value="video">
                  Vídeo
                </option>

                <option value="pdf">
                  PDF
                </option>

                <option value="text">
                  Texto
                </option>

                <option value="live_class">
                  Aula ao vivo
                </option>
              </select>
            </label>

            <label className={labelClass}>
              Status

              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className={inputClass}
              >
                <option value="active">
                  Ativo
                </option>

                <option value="inactive">
                  Inativo
                </option>

                <option value="draft">
                  Rascunho
                </option>

                <option value="archived">
                  Arquivado
                </option>
              </select>
            </label>
          </div>

          <label className={labelClass}>
            Conteúdo em texto

            <textarea
              name="content_text"
              value={formData.content_text}
              onChange={handleChange}
              rows="4"
              placeholder="Insira o conteúdo textual ou instruções..."
              className={inputClass}
            />
          </label>

          {formData.type === "pdf" && (
            <FileUploadField
              purpose="course_material"
              file={selectedFile}
              onFileChange={setSelectedFile}
              label="Arquivo"
              disabled={loading}
              inputClass={inputClass}
            />
          )}

          <label className={labelClass}>
            {formData.type === "pdf" ? "URL do conteúdo (opcional)" : "URL do conteúdo"}

            <input
              name="content_url"
              value={formData.content_url}
              onChange={handleChange}
              placeholder="Link do vídeo, PDF, Google Drive ou aula"
              className={inputClass}
            />
          </label>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className={labelClass}>
              Ordem

              <input
                type="number"
                name="order_index"
                value={formData.order_index}
                onChange={handleChange}
                min="1"
                required
                placeholder="Ex: 1"
                className={inputClass}
              />
            </label>

            <div className="flex items-end">
              <label className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-100">
                <input
                  type="checkbox"
                  name="is_required"
                  checked={
                    formData.is_required
                  }
                  onChange={handleChange}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />

                Conteúdo obrigatório
              </label>
            </div>
          </div>

          <div className="sticky bottom-0 -mx-6 flex justify-end gap-3 border-t border-gray-200 bg-white px-6 py-4">
            <button
              type="button"
              onClick={handleCloseModal}
              disabled={loading}
              className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 hover:shadow-lg disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {submitButtonText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ContentModal;