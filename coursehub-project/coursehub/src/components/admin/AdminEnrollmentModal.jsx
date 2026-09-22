import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../services/APIService";
import { createEnrollment } from "../../services/AdminEnrollmentService";
import { listClasses } from "../../services/AdminClassService";

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

function AdminEnrollmentModal({ handleCloseModal, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingCourseOptions, setLoadingCourseOptions] = useState(false);
  const [error, setError] = useState("");

  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [classes, setClasses] = useState([]);
  const [pricingPlans, setPricingPlans] = useState([]);

  const [formData, setFormData] = useState({
    student_id: "",
    course_id: "",
    class_id: "",
    pricing_plan_id: "",
    enrolled_at: "",
  });

  const [studentQuery, setStudentQuery] = useState("");
  const [studentDropdownOpen, setStudentDropdownOpen] = useState(false);

  useEffect(() => {
    let ignoreRequest = false;

    async function loadBaseOptions() {
      try {
        setLoadingStudents(true);
        setLoadingCourses(true);
        setError("");

        const [studentsResponse, coursesResponse] = await Promise.all([
          apiFetch("/api/admin/students"),
          apiFetch("/api/admin/courses"),
        ]);

        if (ignoreRequest) return;

        const studentList = Array.isArray(studentsResponse) ? studentsResponse : [];
        const courseList = Array.isArray(coursesResponse) ? coursesResponse : [];

        setStudents(studentList.filter((student) => student.status === "active"));
        setCourses(courseList.filter((course) => course.status === "active"));
      } catch (requestError) {
        if (ignoreRequest) return;

        console.error("Erro ao carregar alunos/cursos:", requestError);
        setError(requestError.message || "Não foi possível carregar alunos e cursos.");
      } finally {
        if (!ignoreRequest) {
          setLoadingStudents(false);
          setLoadingCourses(false);
        }
      }
    }

    loadBaseOptions();

    return () => {
      ignoreRequest = true;
    };
  }, []);

  // Turmas e planos de preço dependem do curso selecionado — busca
  // só dispara quando course_id muda, nunca a lista inteira do banco.
  useEffect(() => {
    if (!formData.course_id) {
      setClasses([]);
      setPricingPlans([]);
      return;
    }

    let ignoreRequest = false;

    async function loadCourseOptions() {
      try {
        setLoadingCourseOptions(true);
        setError("");

        const [classesResponse, plansResponse] = await Promise.all([
          listClasses({ courseId: formData.course_id, status: "active", limit: 100 }),
          apiFetch(`/api/admin/courses/${formData.course_id}/pricing-plans`),
        ]);

        if (ignoreRequest) return;

        setClasses(Array.isArray(classesResponse?.data) ? classesResponse.data : []);
        setPricingPlans(Array.isArray(plansResponse) ? plansResponse : []);
      } catch (requestError) {
        if (ignoreRequest) return;

        console.error("Erro ao carregar turmas/planos do curso:", requestError);
        setError(
          requestError.message || "Não foi possível carregar turmas e planos do curso."
        );
      } finally {
        if (!ignoreRequest) {
          setLoadingCourseOptions(false);
        }
      }
    }

    loadCourseOptions();

    return () => {
      ignoreRequest = true;
    };
  }, [formData.course_id]);

  function handleChange(event) {
    const { name, value } = event.target;

    setFormData((previous) => {
      const next = { ...previous, [name]: value };

      if (name === "course_id") {
        next.class_id = "";
        next.pricing_plan_id = "";
      }

      return next;
    });
  }

  const selectedStudent = students.find(
    (student) => String(student.id) === String(formData.student_id)
  );

  // Mesma lógica de busca client-side já usada em StudentsAdmin.jsx
  // (nome, e-mail ou matrícula) -- a lista de alunos ativos já vem
  // inteira do backend, então a busca aqui só filtra o que já está em
  // memória, sem round-trip novo por letra digitada.
  const filteredStudents = useMemo(() => {
    const term = studentQuery.trim().toLowerCase();

    if (!term) return students;

    return students.filter(
      (student) =>
        student.name?.toLowerCase().includes(term) ||
        student.email?.toLowerCase().includes(term) ||
        student.registration_number?.toLowerCase().includes(term)
    );
  }, [students, studentQuery]);

  function handleSelectStudent(student) {
    setFormData((previous) => ({ ...previous, student_id: String(student.id) }));
    setStudentQuery("");
    setStudentDropdownOpen(false);
  }

  function handleClearStudent() {
    setFormData((previous) => ({ ...previous, student_id: "" }));
    setStudentQuery("");
  }

  function validateForm() {
    if (!formData.student_id) return "Selecione um aluno.";
    if (!formData.course_id) return "Selecione um curso.";
    if (!formData.pricing_plan_id) {
      return "Selecione um plano de preço para gerar o contrato financeiro.";
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

    try {
      setLoading(true);

      const result = await createEnrollment({
        student_id: Number(formData.student_id),
        course_id: Number(formData.course_id),
        class_id: formData.class_id ? Number(formData.class_id) : null,
        pricing_plan_id: Number(formData.pricing_plan_id),
        enrolled_at: formData.enrolled_at || null,
      });

      await onSuccess?.(result);
    } catch (requestError) {
      console.error("Erro ao criar matrícula:", requestError);
      setError(requestError.message || "Erro ao criar matrícula.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500";
  const labelClass = "block text-sm font-medium text-gray-700";
  const isBusy = loading || loadingStudents || loadingCourses;

  const selectedPlan = pricingPlans.find(
    (plan) => String(plan.id) === formData.pricing_plan_id
  );

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
          <h2 className="text-xl font-bold text-gray-900">Nova matrícula</h2>

          <p className="mt-1 text-sm text-gray-500">
            A matrícula gera automaticamente um contrato financeiro a partir do
            plano de preço selecionado.
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
            Aluno
            <div className="relative mt-1">
              <input
                type="text"
                value={
                  studentDropdownOpen
                    ? studentQuery
                    : selectedStudent
                      ? `${selectedStudent.name} · ${selectedStudent.registration_number}`
                      : studentQuery
                }
                onChange={(event) => {
                  setStudentQuery(event.target.value);

                  if (formData.student_id) {
                    setFormData((previous) => ({ ...previous, student_id: "" }));
                  }
                }}
                onFocus={() => {
                  setStudentDropdownOpen(true);
                  setStudentQuery("");
                }}
                onBlur={() => setStudentDropdownOpen(false)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setStudentDropdownOpen(false);
                    event.currentTarget.blur();
                    return;
                  }

                  if (event.key === "Enter") {
                    event.preventDefault();

                    if (filteredStudents.length === 1) {
                      handleSelectStudent(filteredStudents[0]);
                    }
                  }
                }}
                placeholder={
                  loadingStudents ? "Carregando alunos..." : "Busque por nome, e-mail ou matrícula"
                }
                disabled={loadingStudents}
                autoComplete="off"
                className={`${inputClass} pr-9`}
              />

              {formData.student_id && !studentDropdownOpen && (
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={handleClearStudent}
                  aria-label="Limpar aluno selecionado"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition hover:text-gray-700"
                >
                  ✕
                </button>
              )}

              {studentDropdownOpen && (
                <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                  {loadingStudents ? (
                    <p className="px-4 py-3 text-sm text-gray-500">Carregando alunos...</p>
                  ) : filteredStudents.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-gray-500">Nenhum aluno encontrado.</p>
                  ) : (
                    filteredStudents.map((student) => (
                      <button
                        key={student.id}
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          handleSelectStudent(student);
                        }}
                        className="block w-full px-4 py-2.5 text-left text-sm text-gray-800 transition hover:bg-blue-50"
                      >
                        <span className="font-medium">{student.name}</span>
                        <span className="ml-1 text-xs text-gray-500">
                          · {student.registration_number}
                          {student.email ? ` · ${student.email}` : ""}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </label>

          <label className={labelClass}>
            Curso
            <select
              name="course_id"
              value={formData.course_id}
              onChange={handleChange}
              required
              disabled={loadingCourses}
              className={inputClass}
            >
              <option value="">
                {loadingCourses ? "Carregando cursos..." : "Selecione um curso"}
              </option>

              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </label>

          <label className={labelClass}>
            Turma (opcional)
            <select
              name="class_id"
              value={formData.class_id}
              onChange={handleChange}
              disabled={!formData.course_id || loadingCourseOptions}
              className={inputClass}
            >
              <option value="">
                {!formData.course_id
                  ? "Selecione um curso primeiro"
                  : loadingCourseOptions
                    ? "Carregando turmas..."
                    : "Sem turma específica"}
              </option>

              {classes.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name}
                </option>
              ))}
            </select>
          </label>

          <label className={labelClass}>
            Plano de preço (gera o contrato financeiro)
            <select
              name="pricing_plan_id"
              value={formData.pricing_plan_id}
              onChange={handleChange}
              required
              disabled={!formData.course_id || loadingCourseOptions}
              className={inputClass}
            >
              <option value="">
                {!formData.course_id
                  ? "Selecione um curso primeiro"
                  : loadingCourseOptions
                    ? "Carregando planos..."
                    : "Selecione um plano"}
              </option>

              {pricingPlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} — {formatCurrency(plan.total_amount)}
                </option>
              ))}
            </select>

            {formData.course_id && !loadingCourseOptions && pricingPlans.length === 0 && (
              <p className="mt-2 text-xs font-medium text-red-600">
                Este curso não possui nenhum plano de preço ativo — cadastre um
                plano antes de matricular alunos nele.
              </p>
            )}

            {selectedPlan && (
              <p className="mt-2 text-xs text-gray-500">
                {selectedPlan.billing_type === "monthly_plan"
                  ? `${selectedPlan.monthly_payment_count}x de ${formatCurrency(selectedPlan.monthly_payment_amount)}`
                  : "Pagamento único"}
              </p>
            )}
          </label>

          <label className={labelClass}>
            Data de matrícula (opcional)
            <input
              type="date"
              name="enrolled_at"
              value={formData.enrolled_at}
              onChange={handleChange}
              className={inputClass}
            />
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
              {loading ? "Salvando..." : "Salvar matrícula"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AdminEnrollmentModal;
