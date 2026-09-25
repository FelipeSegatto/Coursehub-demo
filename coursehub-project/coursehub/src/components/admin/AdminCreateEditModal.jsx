import { useEffect, useState } from "react";
import { apiFetch } from "../../services/APIService";
import MultiSelectField from "./MultiSelectField";

function normalizeIdList(ids) {
  return [...new Set((ids || []).map((id) => Number(id)))]
    .filter((id) => Number.isInteger(id) && id > 0)
    .sort((left, right) => left - right);
}

function sameIdList(left, right) {
  const normalizedLeft = normalizeIdList(left);
  const normalizedRight = normalizeIdList(right);

  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((id, index) => id === normalizedRight[index])
  );
}

function AdminCreateEditModal({
  mode = "create",
  variant = "student",
  initialData = null,
  handleCloseModal,
  onSuccess,
}) {
  const isStudentVariant =
    variant === "student";

  const isTeacherVariant =
    variant === "teacher";

  const isCourseVariant =
    variant === "course";

  const isEditMode =
    mode === "edit";

  const [loading, setLoading] =
    useState(false);

  const [loadingTeachers, setLoadingTeachers] =
    useState(false);

  const [
    loadingInitialData,
    setLoadingInitialData,
  ] = useState(false);

  const [error, setError] =
    useState("");

  const [teachers, setTeachers] =
    useState([]);

  const [formStudentData, setFormStudentData] =
    useState({
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      gender: "Masculino",
      birth_date: "",
      cpf: "",
      phone: "",
      address: "",
      status: "active",
    });

  const [formTeacherData, setFormTeacherData] =
    useState({
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      gender: "Masculino",
      specialty: "",
      cpf: "",
      phone: "",
      status: "active",
      courseIds: [],
    });

  const [formCourseData, setFormCourseData] =
    useState({
      name: "",
      description: "",
      workload_hours: "",
      price: "",
      status: "active",
      teacherIds: [],
      image_url: "",
      nivel: "Iniciante",
      expanded_description: "",
      syllabus: "",
      category: "",
    });

  const [courses, setCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [courseLinkConfirm, setCourseLinkConfirm] = useState(false);

  /*
   * Busca os professores somente quando
   * o modal está sendo usado para cursos.
   *
   * O useEffect duplicado foi removido.
   */
  useEffect(() => {
    if (!isCourseVariant) {
      return;
    }

    let ignoreRequest = false;

    async function fetchTeachers() {
      try {
        setLoadingTeachers(true);
        setError("");

        const response = await apiFetch(
          "/api/admin/teachers"
        );

        const teacherList = Array.isArray(response)
          ? response
          : Array.isArray(response?.teachers)
            ? response.teachers
            : Array.isArray(response?.data)
              ? response.data
              : [];

        if (!ignoreRequest) {
          setTeachers(teacherList);
        }
      } catch (error) {
        if (ignoreRequest) return;

        console.error(
          "Erro ao carregar professores:",
          error
        );

        setTeachers([]);

        setError(
          error.message ||
            "Não foi possível carregar a lista de professores."
        );
      } finally {
        if (!ignoreRequest) {
          setLoadingTeachers(false);
        }
      }
    }

    fetchTeachers();

    return () => {
      ignoreRequest = true;
    };
  }, [isCourseVariant]);

  /*
   * Busca os cursos somente quando o modal está sendo usado para
   * professores -- multi-select de "Cursos vinculados".
   */
  useEffect(() => {
    if (!isTeacherVariant) {
      return;
    }

    let ignoreRequest = false;

    async function fetchCourses() {
      try {
        setLoadingCourses(true);
        setError("");

        const response = await apiFetch("/api/admin/courses");

        const courseList = Array.isArray(response)
          ? response
          : Array.isArray(response?.courses)
            ? response.courses
            : Array.isArray(response?.data)
              ? response.data
              : [];

        if (!ignoreRequest) {
          setCourses(courseList);
        }
      } catch (error) {
        if (ignoreRequest) return;

        console.error("Erro ao carregar cursos:", error);
        setCourses([]);
        setError(error.message || "Não foi possível carregar a lista de cursos.");
      } finally {
        if (!ignoreRequest) {
          setLoadingCourses(false);
        }
      }
    }

    fetchCourses();

    return () => {
      ignoreRequest = true;
    };
  }, [isTeacherVariant]);

  /*
   * Preenche o formulário do professor
   * com os dados recebidos da listagem.
   */
  useEffect(() => {
    if (
      !isEditMode ||
      !initialData ||
      !isTeacherVariant
    ) {
      return;
    }

    setFormTeacherData({
      name: initialData.name || "",
      email: initialData.email || "",
      password: "",
      confirmPassword: "",
      gender:
        initialData.gender || "Masculino",
      specialty:
        initialData.specialty || "",
      cpf: initialData.cpf || "",
      phone: initialData.phone || "",
      status:
        initialData.status || "active",
      courseIds:
        initialData.courseIds || [],
    });
    setCourseLinkConfirm(false);
  }, [
    isEditMode,
    initialData,
    isTeacherVariant,
  ]);

  /*
   * Busca o curso completo no modo de edição.
   *
   * A listagem pode não trazer todos os campos,
   * como syllabus e descrição expandida.
   */
  useEffect(() => {
    if (
      !isEditMode ||
      !isCourseVariant ||
      !initialData?.id
    ) {
      return;
    }

    let ignoreRequest = false;

    async function fetchCourseData() {
      try {
        setLoadingInitialData(true);
        setError("");

        const response = await apiFetch(
          `/api/admin/courses/${initialData.id}`
        );

        const course =
          response?.course ||
          response?.data ||
          response;

        if (!course?.id) {
          throw new Error(
            "A API não retornou os dados do curso."
          );
        }

        if (ignoreRequest) return;

        setFormCourseData({
          name: course.name || "",
          description:
            course.description || "",
          workload_hours:
            course.workload_hours ?? "",
          price: course.price ?? "",
          status:
            course.status || "active",
          teacherIds:
            course.teacherIds || [],
          image_url:
            course.image_url || "",
          nivel:
            course.nivel || "Iniciante",
          expanded_description:
            course.expanded_description || "",
          syllabus:
            course.syllabus || "",
          category:
            course.category || "",
        });
      } catch (error) {
        if (ignoreRequest) return;

        console.error(
          "Erro ao carregar curso:",
          error
        );

        setError(
          error.message ||
            "Não foi possível carregar os dados do curso."
        );
      } finally {
        if (!ignoreRequest) {
          setLoadingInitialData(false);
        }
      }
    }

    fetchCourseData();

    return () => {
      ignoreRequest = true;
    };
  }, [
    isEditMode,
    isCourseVariant,
    initialData?.id,
  ]);

  /*
   * Busca o aluno completo no modo de edição.
   */
  useEffect(() => {
    if (
      !isEditMode ||
      !isStudentVariant ||
      !initialData?.id
    ) {
      return;
    }

    let ignoreRequest = false;

    async function fetchStudentData() {
      try {
        setLoadingInitialData(true);
        setError("");

        const response = await apiFetch(
          `/api/admin/students/${initialData.id}`
        );

        const student =
          response?.student ||
          response?.data ||
          response;

        if (!student?.id) {
          throw new Error(
            "A API não retornou os dados do aluno."
          );
        }

        if (ignoreRequest) return;

        setFormStudentData({
          name: student.name || "",
          email: student.email || "",
          password: "",
          confirmPassword: "",
          gender:
            student.gender || "Masculino",
          birth_date: student.birth_date
            ? String(
                student.birth_date
              ).slice(0, 10)
            : "",
          cpf: student.cpf || "",
          phone: student.phone || "",
          address: student.address || "",
          status:
            student.status || "active",
        });
      } catch (error) {
        if (ignoreRequest) return;

        console.error(
          "Erro ao carregar aluno:",
          error
        );

        setError(
          error.message ||
            "Não foi possível carregar os dados do aluno."
        );
      } finally {
        if (!ignoreRequest) {
          setLoadingInitialData(false);
        }
      }
    }

    fetchStudentData();

    return () => {
      ignoreRequest = true;
    };
  }, [
    isEditMode,
    isStudentVariant,
    initialData?.id,
  ]);

  function getCurrentForm() {
    if (isTeacherVariant) {
      return formTeacherData;
    }

    if (isCourseVariant) {
      return formCourseData;
    }

    return formStudentData;
  }

  function setCurrentForm(updater) {
    if (isTeacherVariant) {
      setFormTeacherData(updater);
      return;
    }

    if (isCourseVariant) {
      setFormCourseData(updater);
      return;
    }

    setFormStudentData(updater);
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setCurrentForm((previousForm) => ({
      ...previousForm,
      [name]: value,
    }));
  }

  function validateForm() {
    const form = getCurrentForm();

    if (!form.name?.trim()) {
      return isCourseVariant
        ? "Nome do curso é obrigatório."
        : "Nome é obrigatório.";
    }

    if (
      (isStudentVariant ||
        isTeacherVariant) &&
      !form.email?.trim()
    ) {
      return "E-mail é obrigatório.";
    }

    if (
      (isStudentVariant ||
        isTeacherVariant) &&
      !isEditMode &&
      (!form.password ||
        !form.confirmPassword)
    ) {
      return "Senha e confirmação de senha são obrigatórias.";
    }

    if (
      (isStudentVariant ||
        isTeacherVariant) &&
      (form.password ||
        form.confirmPassword) &&
      form.password !== form.confirmPassword
    ) {
      return "As senhas não coincidem.";
    }

    if (isStudentVariant) {
      if (
        !form.birth_date ||
        !form.cpf ||
        !form.phone
      ) {
        return "Data de nascimento, CPF e telefone são obrigatórios.";
      }
    }

    if (isCourseVariant) {
      if (!form.description?.trim()) {
        return "Descrição do curso é obrigatória.";
      }

      if (
        form.workload_hours !== "" &&
        Number(form.workload_hours) < 0
      ) {
        return "Carga horária inválida.";
      }
    }

    return "";
  }

  function getEndpoint() {
    if (isStudentVariant) {
      return isEditMode
        ? `/api/admin/students/${initialData.id}`
        : "/api/admin/students";
    }

    if (isTeacherVariant) {
      return isEditMode
        ? `/api/admin/teachers/${initialData.id}`
        : "/api/admin/teachers";
    }

    if (isCourseVariant) {
      return isEditMode
        ? `/api/admin/courses/${initialData.id}`
        : "/api/admin/courses";
    }

    throw new Error(
      "Tipo de cadastro inválido."
    );
  }

  function getPayload() {
    if (isStudentVariant) {
      const payload = {
        name: formStudentData.name.trim(),
        email: formStudentData.email.trim(),
        gender: formStudentData.gender,
        birth_date:
          formStudentData.birth_date,
        cpf: formStudentData.cpf.trim(),
        phone:
          formStudentData.phone.trim(),
        address:
          formStudentData.address.trim() ||
          null,
        status:
          formStudentData.status ||
          "active",
      };

      if (formStudentData.password) {
        payload.password =
          formStudentData.password;
      }

      return payload;
    }

    if (isTeacherVariant) {
      const payload = {
        name: formTeacherData.name.trim(),
        email:
          formTeacherData.email.trim(),
        gender: formTeacherData.gender,
        specialty:
          formTeacherData.specialty.trim() ||
          null,
        cpf:
          formTeacherData.cpf.trim() ||
          null,
        phone:
          formTeacherData.phone.trim() ||
          null,
        status:
          formTeacherData.status ||
          "active",
        courseIds:
          formTeacherData.courseIds,
      };

      if (formTeacherData.password) {
        payload.password =
          formTeacherData.password;
      }

      return payload;
    }

    return {
      name: formCourseData.name.trim(),
      description:
        formCourseData.description.trim(),

      workload_hours:
        formCourseData.workload_hours === ""
          ? 0
          : Number(
              formCourseData.workload_hours
            ),

      price:
        formCourseData.price === ""
          ? 0
          : Number(formCourseData.price),

      status:
        formCourseData.status ||
        "active",

      teacherIds:
        formCourseData.teacherIds,

      image_url:
        formCourseData.image_url.trim() ||
        null,

      nivel:
        formCourseData.nivel ||
        "Iniciante",

      expanded_description:
        formCourseData.expanded_description.trim() ||
        null,

      syllabus:
        formCourseData.syllabus.trim() ||
        null,

      category:
        formCourseData.category.trim() ||
        null,
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (
      loading ||
      loadingTeachers ||
      loadingInitialData
    ) {
      return;
    }

    setError("");

    const validationError =
      validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    const courseLinksChanged =
      isEditMode &&
      isTeacherVariant &&
      !sameIdList(initialData?.courseIds, formTeacherData.courseIds);

    if (courseLinksChanged && !courseLinkConfirm) {
      setCourseLinkConfirm(true);
      return;
    }

    try {
      setLoading(true);

      const savedItem = await apiFetch(
        getEndpoint(),
        {
          method: isEditMode
            ? "PUT"
            : "POST",

          body: JSON.stringify(
            getPayload()
          ),
        }
      );

      await onSuccess?.(savedItem);
    } catch (error) {
      console.error(
        "Erro ao salvar cadastro:",
        error
      );

      setError(
        error.message ||
          "Erro ao salvar cadastro."
      );
    } finally {
      setLoading(false);
    }
  }

  const modalTitle = getModalTitle(
    variant,
    isEditMode
  );

  const modalDescription =
    getModalDescription(
      variant,
      isEditMode
    );

  const submitButtonText =
    getSubmitButtonText(
      variant,
      isEditMode
    );

  const inputClass =
    "mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500";

  const labelClass =
    "block text-sm font-medium text-gray-700";

  const isModalBusy =
    loading ||
    loadingTeachers ||
    loadingInitialData;

  const originalCourseIds = normalizeIdList(initialData?.courseIds);
  const nextCourseIds = normalizeIdList(formTeacherData.courseIds);
  const removedCourseIds = originalCourseIds.filter((id) => !nextCourseIds.includes(id));
  const addedCourseIds = nextCourseIds.filter((id) => !originalCourseIds.includes(id));

  function courseName(id) {
    return courses.find((course) => Number(course.id) === id)?.name || `Curso ${id}`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
        <button
          type="button"
          onClick={handleCloseModal}
          disabled={isModalBusy}
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

        {loadingInitialData ? (
          <div className="flex min-h-64 items-center justify-center px-6 py-12">
            <p className="text-sm font-medium text-gray-500">
              {isCourseVariant
                ? "Carregando dados do curso..."
                : "Carregando dados do cadastro..."}
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex-1 space-y-5 overflow-y-auto px-6 py-6"
          >
            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
              </p>
            )}

            {courseLinkConfirm ? (
              <CourseLinkConfirm
                teacherName={formTeacherData.name}
                removedNames={removedCourseIds.map(courseName)}
                addedNames={addedCourseIds.map(courseName)}
              />
            ) : (
              <>
            {isStudentVariant && (
              <StudentFields
                formData={formStudentData}
                handleChange={handleChange}
                inputClass={inputClass}
                labelClass={labelClass}
                isEditMode={isEditMode}
              />
            )}

            {isTeacherVariant && (
              <TeacherFields
                formData={formTeacherData}
                handleChange={handleChange}
                inputClass={inputClass}
                labelClass={labelClass}
                isEditMode={isEditMode}
                courses={courses}
                loadingCourses={loadingCourses}
              />
            )}

            {isCourseVariant && (
              <CourseFields
                formData={formCourseData}
                handleChange={handleChange}
                inputClass={inputClass}
                labelClass={labelClass}
                teachers={teachers}
                loadingTeachers={
                  loadingTeachers
                }
              />
            )}

              </>
            )}

            <div className="sticky bottom-0 -mx-6 flex justify-end gap-3 border-t border-gray-200 bg-white px-6 py-4">
              <button
                type="button"
                onClick={courseLinkConfirm ? () => setCourseLinkConfirm(false) : handleCloseModal}
                disabled={isModalBusy}
                className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {courseLinkConfirm ? "Voltar" : "Cancelar"}
              </button>

              <button
                type="submit"
                disabled={isModalBusy}
                className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed ${
                  courseLinkConfirm
                    ? "bg-rose-700 hover:bg-rose-800 disabled:bg-rose-300"
                    : "bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300"
                }`}
              >
                {loading
                  ? "Salvando..."
                  : courseLinkConfirm
                    ? "Confirmar alteração do vínculo"
                    : loadingTeachers
                    ? "Carregando professores..."
                    : submitButtonText}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function CourseLinkConfirm({ teacherName, removedNames, addedNames }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-5">
      <p className="text-sm font-semibold text-rose-950">
        Confirmar a mudança de vínculo
      </p>
      <p className="mt-2 text-sm leading-6 text-rose-900">
        {teacherName ? `${teacherName} deixa de seguir a lista atual de cursos.` : "Este professor deixa de seguir a lista atual de cursos."}{" "}
        A chamada, os materiais e a fila de correção passam a usar os cursos confirmados aqui.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-rose-100">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-500">
            Sai do vínculo
          </p>
          <CourseNameList names={removedNames} emptyLabel="Nenhum curso removido." />
        </div>
        <div className="rounded-xl bg-white px-4 py-3 ring-1 ring-emerald-100">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-600">
            Entra no vínculo
          </p>
          <CourseNameList names={addedNames} emptyLabel="Nenhum curso novo." />
        </div>
      </div>
    </div>
  );
}

function CourseNameList({ names, emptyLabel }) {
  if (names.length === 0) {
    return <p className="mt-2 text-sm text-slate-500">{emptyLabel}</p>;
  }

  return (
    <ul className="mt-2 space-y-1 text-sm font-medium text-slate-800">
      {names.map((name) => (
        <li key={name}>{name}</li>
      ))}
    </ul>
  );
}

function UserBaseFields({
  formData,
  handleChange,
  inputClass,
  labelClass,
  isEditMode,
}) {
  return (
    <>
      <label className={labelClass}>
        Nome

        <input
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
          placeholder="Ex: Sophia Fernandez"
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        E-mail

        <input
          type="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          required
          placeholder="sophia@email.com"
          className={inputClass}
        />
      </label>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className={labelClass}>
          Senha

          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            required={!isEditMode}
            placeholder={
              isEditMode
                ? "Deixe vazio para manter"
                : "Digite uma senha"
            }
            className={inputClass}
          />
        </label>

        <label className={labelClass}>
          Confirmar senha

          <input
            type="password"
            name="confirmPassword"
            value={
              formData.confirmPassword
            }
            onChange={handleChange}
            required={!isEditMode}
            placeholder={
              isEditMode
                ? "Deixe vazio para manter"
                : "Confirme a senha"
            }
            className={inputClass}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className={labelClass}>
          Gênero

          <select
            name="gender"
            value={formData.gender}
            onChange={handleChange}
            className={inputClass}
          >
            <option value="Masculino">
              Masculino
            </option>

            <option value="Feminino">
              Feminino
            </option>

            <option value="Outro">
              Outro
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
          </select>
        </label>
      </div>
    </>
  );
}

function StudentFields(props) {
  return (
    <>
      <UserBaseFields {...props} />

      <label className={props.labelClass}>
        Data de nascimento

        <input
          type="date"
          name="birth_date"
          value={props.formData.birth_date}
          onChange={props.handleChange}
          required
          className={props.inputClass}
        />
      </label>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className={props.labelClass}>
          CPF

          <input
            name="cpf"
            value={props.formData.cpf}
            onChange={props.handleChange}
            required
            placeholder="000.000.000-00"
            className={props.inputClass}
          />
        </label>

        <label className={props.labelClass}>
          Telefone

          <input
            name="phone"
            value={props.formData.phone}
            onChange={props.handleChange}
            required
            placeholder="(00) 00000-0000"
            className={props.inputClass}
          />
        </label>
      </div>

      <label className={props.labelClass}>
        Endereço

        <input
          name="address"
          value={props.formData.address}
          onChange={props.handleChange}
          placeholder="Ex: Arapiraca - AL"
          className={props.inputClass}
        />
      </label>
    </>
  );
}

function TeacherFields(props) {
  const { formData, handleChange, courses = [], loadingCourses = false } = props;

  return (
    <>
      <UserBaseFields {...props} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className={props.labelClass}>
          CPF

          <input
            name="cpf"
            value={props.formData.cpf}
            onChange={props.handleChange}
            placeholder="000.000.000-00"
            className={props.inputClass}
          />
        </label>

        <label className={props.labelClass}>
          Telefone

          <input
            name="phone"
            value={props.formData.phone}
            onChange={props.handleChange}
            placeholder="(00) 00000-0000"
            className={props.inputClass}
          />
        </label>
      </div>

      <label className={props.labelClass}>
        Especialidade

        <input
          name="specialty"
          value={
            props.formData.specialty
          }
          onChange={props.handleChange}
          placeholder="Ex: Front-end, UX/UI, Banco de Dados"
          className={props.inputClass}
        />
      </label>

      <MultiSelectField
        id="teacher-course-ids"
        label="Cursos vinculados"
        options={courses.map((course) => ({ id: course.id, name: course.name }))}
        selectedIds={formData.courseIds}
        onChange={(courseIds) =>
          handleChange({ target: { name: "courseIds", value: courseIds } })
        }
        loading={loadingCourses}
        placeholder="Buscar curso..."
        emptyOptionsMessage="Nenhum curso foi encontrado."
        noneSelectedMessage="Nenhum curso vinculado."
      />
    </>
  );
}

function CourseFields({
  formData,
  handleChange,
  inputClass,
  labelClass,
  teachers,
  loadingTeachers,
}) {
  return (
    <>
      <label className={labelClass}>
        Nome do curso

        <input
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
          placeholder="Ex: React do Zero ao Dashboard"
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
          required
          placeholder="Breve descrição do curso..."
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        Carga horária

        <input
          type="number"
          name="workload_hours"
          value={formData.workload_hours}
          onChange={handleChange}
          min="0"
          placeholder="Ex: 40"
          className={inputClass}
        />
      </label>

      <p className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        O preço do curso agora é definido pelos planos comerciais associados a ele, em{" "}
        <strong>Financeiro → Planos comerciais</strong>. Este formulário não define mais
        valores.
      </p>

      <MultiSelectField
        id="course-teacher-ids"
        label="Professores do curso"
        options={teachers.map((teacher) => ({ id: teacher.id, name: teacher.name }))}
        selectedIds={formData.teacherIds}
        onChange={(teacherIds) =>
          handleChange({ target: { name: "teacherIds", value: teacherIds } })
        }
        loading={loadingTeachers}
        placeholder="Buscar professor..."
        emptyOptionsMessage="Nenhum professor foi encontrado."
        noneSelectedMessage="Nenhum professor vinculado."
      />

      <label className={labelClass}>
        Nível

        <select
          name="nivel"
          value={formData.nivel}
          onChange={handleChange}
          className={inputClass}
        >
          <option value="Iniciante">
            Iniciante
          </option>

          <option value="Intermediário">
            Intermediário
          </option>

          <option value="Avançado">
            Avançado
          </option>
        </select>
      </label>

      <label className={labelClass}>
        Categoria

        <input
          name="category"
          value={formData.category}
          onChange={handleChange}
          placeholder="Ex: Front-end"
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        URL da imagem

        <input
          name="image_url"
          value={formData.image_url}
          onChange={handleChange}
          placeholder="/images/course-1.webp"
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        Descrição expandida

        <textarea
          name="expanded_description"
          value={
            formData.expanded_description
          }
          onChange={handleChange}
          rows="4"
          placeholder="Descrição mais completa do curso..."
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        Ementa

        <textarea
          name="syllabus"
          value={formData.syllabus}
          onChange={handleChange}
          rows="4"
          placeholder="Liste os principais tópicos do curso..."
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
    </>
  );
}

function getModalTitle(
  variant,
  isEditMode
) {
  if (variant === "teacher") {
    return isEditMode
      ? "Editar dados do professor"
      : "Cadastrar novo professor";
  }

  if (variant === "course") {
    return isEditMode
      ? "Editar curso"
      : "Cadastrar curso";
  }

  return isEditMode
    ? "Editar dados do aluno"
    : "Cadastrar aluno";
}

function getModalDescription(
  variant,
  isEditMode
) {
  if (variant === "teacher") {
    return isEditMode
      ? "Altere os dados abaixo para atualizar este professor."
      : "Preencha os dados abaixo para adicionar um novo professor.";
  }

  if (variant === "course") {
    return isEditMode
      ? "Altere os dados abaixo para atualizar este curso."
      : "Preencha os dados abaixo para adicionar um novo curso.";
  }

  return isEditMode
    ? "Altere os dados abaixo para atualizar este aluno."
    : "Preencha os dados abaixo para adicionar um novo aluno.";
}

function getSubmitButtonText(
  variant,
  isEditMode
) {
  if (variant === "teacher") {
    return isEditMode
      ? "Salvar alterações do professor"
      : "Salvar cadastro do professor";
  }

  if (variant === "course") {
    return isEditMode
      ? "Salvar alterações do curso"
      : "Salvar novo curso";
  }

  return isEditMode
    ? "Salvar alterações do aluno"
    : "Salvar cadastro do aluno";
}

export default AdminCreateEditModal;