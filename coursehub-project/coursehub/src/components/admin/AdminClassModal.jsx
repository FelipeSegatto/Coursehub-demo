import { useEffect, useState } from "react";
import { apiFetch } from "../../services/APIService";
import { createClass, updateClass } from "../../services/AdminClassService";

const SHIFT_OPTIONS = [
  { value: "morning", label: "Manhã" },
  { value: "afternoon", label: "Tarde" },
  { value: "night", label: "Noite" },
  { value: "online", label: "Online" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Ativa" },
  { value: "inactive", label: "Inativa" },
  { value: "finished", label: "Finalizada" },
];

function toDateInputValue(value) {
  return value ? String(value).slice(0, 10) : "";
}

function AdminClassModal({ mode = "create", initialData = null, handleCloseModal, onSuccess }) {
  const isEditMode = mode === "edit";

  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [error, setError] = useState("");

  const [courses, setCourses] = useState([]);
  const [eligibleTeachers, setEligibleTeachers] = useState([]);
  const [loadingEligibleTeachers, setLoadingEligibleTeachers] = useState(false);

  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    course_id: initialData?.course?.id ? String(initialData.course.id) : "",
    teacher_id: initialData?.teacher?.id ? String(initialData.teacher.id) : "",
    shift: initialData?.shift || "online",
    start_date: toDateInputValue(initialData?.startDate),
    end_date: toDateInputValue(initialData?.endDate),
    status: initialData?.status || "active",
  });

  useEffect(() => {
    let ignoreRequest = false;

    async function loadOptions() {
      try {
        setLoadingOptions(true);
        setError("");

        const coursesResponse = await apiFetch("/api/admin/courses");

        if (ignoreRequest) return;

        const courseList = Array.isArray(coursesResponse)
          ? coursesResponse
          : Array.isArray(coursesResponse?.data)
            ? coursesResponse.data
            : [];

        setCourses(courseList);
      } catch (requestError) {
        if (ignoreRequest) return;

        console.error("Erro ao carregar cursos:", requestError);
        setError(requestError.message || "Não foi possível carregar a lista de cursos.");
      } finally {
        if (!ignoreRequest) {
          setLoadingOptions(false);
        }
      }
    }

    loadOptions();

    return () => {
      ignoreRequest = true;
    };
  }, []);

  // O professor responsável só pode ser alguém vinculado ao curso da
  // turma (course_teachers ativo, com courses.teacher_id legado como
  // vínculo elegível) -- refeito sempre que o curso muda, e já roda
  // no mount em modo de edição (course_id vem preenchido).
  useEffect(() => {
    const courseId = formData.course_id;

    if (!courseId) {
      setEligibleTeachers([]);
      return undefined;
    }

    let ignoreRequest = false;

    async function loadEligibleTeachers() {
      try {
        setLoadingEligibleTeachers(true);
        setError("");

        const response = await apiFetch(`/api/admin/courses/${courseId}`);
        const course = response?.course || response?.data || response;
        const teacherList = Array.isArray(course?.teachers) ? course.teachers : [];

        if (!ignoreRequest) {
          setEligibleTeachers(
            teacherList.filter((teacher) => teacher.teacher_status === "active")
          );
        }
      } catch (requestError) {
        if (ignoreRequest) return;

        console.error("Erro ao carregar professores do curso:", requestError);
        setError(
          requestError.message || "Não foi possível carregar os professores do curso."
        );
        setEligibleTeachers([]);
      } finally {
        if (!ignoreRequest) {
          setLoadingEligibleTeachers(false);
        }
      }
    }

    loadEligibleTeachers();

    return () => {
      ignoreRequest = true;
    };
  }, [formData.course_id]);

  function handleChange(event) {
    const { name, value } = event.target;

    setFormData((previous) => ({ ...previous, [name]: value }));
  }

  // Trocar o curso invalida a escolha anterior de professor -- ela só
  // fazia sentido para o curso antigo.
  function handleCourseChange(event) {
    const { value } = event.target;

    setFormData((previous) => ({ ...previous, course_id: value, teacher_id: "" }));
  }

  function validateForm() {
    if (!formData.name.trim()) {
      return "O nome da turma é obrigatório.";
    }

    if (formData.name.trim().length > 120) {
      return "O nome da turma deve ter no máximo 120 caracteres.";
    }

    if (!isEditMode && !formData.course_id) {
      return "Selecione um curso.";
    }

    if (!formData.teacher_id) {
      return "Selecione um professor.";
    }

    if (
      formData.start_date &&
      formData.end_date &&
      formData.end_date < formData.start_date
    ) {
      return "A data final não pode ser anterior à data inicial.";
    }

    return "";
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (loading || loadingOptions) return;

    setError("");

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    const payload = {
      name: formData.name.trim(),
      teacher_id: Number(formData.teacher_id),
      shift: formData.shift,
      start_date: formData.start_date || null,
      end_date: formData.end_date || null,
      status: formData.status,
    };

    if (!isEditMode) {
      payload.course_id = Number(formData.course_id);
    }

    try {
      setLoading(true);

      const result = isEditMode
        ? await updateClass(initialData.id, payload)
        : await createClass(payload);

      await onSuccess?.(result);
    } catch (requestError) {
      console.error("Erro ao salvar turma:", requestError);
      setError(requestError.message || "Erro ao salvar turma.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500";
  const labelClass = "block text-sm font-medium text-gray-700";
  const isBusy = loading || loadingOptions;

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
            {isEditMode ? "Editar turma" : "Cadastrar turma"}
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            {isEditMode
              ? "Altere os dados abaixo para atualizar esta turma."
              : "Preencha os dados abaixo para criar uma nova turma."}
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
            Nome da turma
            <input
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder="Ex: React do Zero — Turma A 2026"
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            Curso
            <select
              name="course_id"
              value={formData.course_id}
              onChange={handleCourseChange}
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
                O curso de uma turma não pode ser alterado após a criação.
              </span>
            )}
          </label>

          <label className={labelClass}>
            Professor responsável
            <select
              name="teacher_id"
              value={formData.teacher_id}
              onChange={handleChange}
              required
              disabled={!formData.course_id || loadingOptions || loadingEligibleTeachers}
              className={inputClass}
            >
              <option value="">
                {!formData.course_id
                  ? "Selecione um curso primeiro"
                  : loadingEligibleTeachers
                    ? "Carregando professores..."
                    : "Selecione um professor"}
              </option>

              {eligibleTeachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </option>
              ))}
            </select>

            {formData.course_id && !loadingEligibleTeachers && eligibleTeachers.length === 0 && (
              <p className="mt-2 text-xs font-medium text-red-600">
                Nenhum professor ativo está vinculado a este curso.
              </p>
            )}
          </label>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className={labelClass}>
              Turno
              <select
                name="shift"
                value={formData.shift}
                onChange={handleChange}
                className={inputClass}
              >
                {SHIFT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
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
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className={labelClass}>
              Início
              <input
                type="date"
                name="start_date"
                value={formData.start_date}
                onChange={handleChange}
                className={inputClass}
              />
            </label>

            <label className={labelClass}>
              Término
              <input
                type="date"
                name="end_date"
                value={formData.end_date}
                onChange={handleChange}
                className={inputClass}
              />
            </label>
          </div>

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
              {loading ? "Salvando..." : isEditMode ? "Salvar alterações" : "Salvar turma"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AdminClassModal;
