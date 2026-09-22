import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { apiFetch } from "../../services/APIService";
import { listClasses } from "../../services/AdminClassService";
import { useAppliedFilters } from "../../hooks/useAppliedFilters";

import ManagementPageShell from "../../components/ui/ManagementPageShell";
import AdminCreateEditModal from "../../components/admin/AdminCreateEditModal";
import DeleteConfirmModal from "../../components/admin/AdminDeleteModal";
import AdminTable from "../../components/admin/AdminTable";
import AdminStatusFilter from "../../components/admin/AdminStatusFilter";
import TableActionButton from "../../components/ui/actions/TableActionButton";
import RowActionsMenu from "../../components/ui/actions/RowActionsMenu";
import MobileFilterToggle from "../../components/ui/MobileFilterToggle";
import MobileExpandableCard from "../../components/ui/MobileExpandableCard";

import StatusBadge from "../../components/ui/StatusBadge";

const studentStatusOptions = [
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
  { value: "cancelled", label: "Cancelados" },
];

const INITIAL_DRAFT = { courseId: "", classId: "", status: "active" };

const inputClass =
  "w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:w-auto";

/**
 * Não carrega todos os alunos da plataforma de cara -- exige um
 * curso selecionado (turma refina, opcional) antes de consultar,
 * mesmo padrão de escopo obrigatório já usado em Notas/Frequência/
 * Progressão administrativas (useAppliedFilters).
 */
export default function StudentsAdmin() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { draft, updateDraft, applied, hasApplied, isStale, apply, clear } =
    useAppliedFilters({
      courseId: searchParams.get("courseId") || INITIAL_DRAFT.courseId,
      classId: searchParams.get("classId") || INITIAL_DRAFT.classId,
      status: searchParams.get("status") || INITIAL_DRAFT.status,
    });

  // Deep link from the dashboard (ex.: /admin/alunos?status=active) --
  // auto-applies once on mount so the filtered list shows up right
  // away, without requiring the "Aplicar filtros" click a plain visit
  // to the page still requires.
  useEffect(() => {
    if (searchParams.get("courseId") || searchParams.get("classId") || searchParams.get("status")) {
      apply();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keeps the URL in sync with the applied filters -- refresh never
  // loses them, and clearing the filters clears the query string too.
  useEffect(() => {
    if (applied) {
      const params = new URLSearchParams();
      if (applied.courseId) params.set("courseId", applied.courseId);
      if (applied.classId) params.set("classId", applied.classId);
      if (applied.status) params.set("status", applied.status);
      setSearchParams(params, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied]);

  const [students, setStudents] = useState([]);
  const [busca, setBusca] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [courses, setCourses] = useState([]);
  const [filterClasses, setFilterClasses] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [selectedStudent, setSelectedStudent] = useState(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);

  async function fetchStudents() {
    if (!applied) return;

    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();
      if (applied.courseId) params.set("courseId", applied.courseId);
      if (applied.classId) params.set("classId", applied.classId);
      if (applied.status) params.set("status", applied.status);

      const data = await apiFetch(`/api/admin/students?${params.toString()}`);
      setStudents(Array.isArray(data) ? data : []);
    } catch (error) {
      setError(error.message || "Erro ao buscar alunos.");
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied]);

  useEffect(() => {
    let ignoreRequest = false;

    async function loadCourses() {
      try {
        const response = await apiFetch("/api/admin/courses");

        if (!ignoreRequest) setCourses(Array.isArray(response) ? response : []);
      } catch (requestError) {
        if (!ignoreRequest) console.error("Erro ao carregar cursos:", requestError);
      }
    }

    loadCourses();

    return () => {
      ignoreRequest = true;
    };
  }, []);

  useEffect(() => {
    if (!draft.courseId) {
      setFilterClasses([]);
      if (draft.classId) updateDraft({ classId: "" });
      return;
    }

    let ignoreRequest = false;

    async function loadClassesForFilter() {
      try {
        const response = await listClasses({ courseId: draft.courseId, limit: 100 });

        if (!ignoreRequest) setFilterClasses(Array.isArray(response?.data) ? response.data : []);
      } catch (requestError) {
        if (!ignoreRequest) console.error("Erro ao carregar turmas do curso:", requestError);
      }
    }

    loadClassesForFilter();

    return () => {
      ignoreRequest = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.courseId]);

  function handleCreateClick() {
    setModalMode("create");
    setSelectedStudent(null);
    setModalOpen(true);
  }

  function handleEditClick(student) {
    setModalMode("edit");
    setSelectedStudent(student);
    setModalOpen(true);
  }

  function handleDeleteClick(student) {
    setSelectedStudent(student);
    setDeleteModalOpen(true);
  }

  async function handleConfirmDelete() {
    if (!selectedStudent?.id) return;

    try {
      setLoadingDelete(true);

      await apiFetch(`/api/admin/students/${selectedStudent.id}`, {
        method: "DELETE",
      });

      setDeleteModalOpen(false);
      setSelectedStudent(null);
      fetchStudents();
    } catch (error) {
      alert(error.message || "Erro ao remover aluno.");
    } finally {
      setLoadingDelete(false);
    }
  }

  const filteredStudents = useMemo(() => {
    const term = busca.trim().toLowerCase();

    return students.filter((student) => {
      return (
        !term ||
        student.name?.toLowerCase().includes(term) ||
        student.email?.toLowerCase().includes(term) ||
        student.registration_number?.toLowerCase().includes(term)
      );
    });
  }, [students, busca]);

  const stats = useMemo(() => {
    return [
      { title: "Total encontrado", value: students.length },
      {
        title: "Alunos ativos",
        value: students.filter((student) => student.status === "active").length,
      },
      {
        title: "Inativos",
        value: students.filter((student) => student.status === "inactive").length,
      },
      {
        title: "Cancelados",
        value: students.filter((student) => student.status === "cancelled").length,
      },
    ];
  }, [students]);

  const quickActions = [
    {
      title: "Cadastrar aluno",
      description: "Adicione um novo aluno à plataforma.",
      onClick: handleCreateClick,
    },
    {
      title: "Acompanhar matrículas",
      description: "Veja os cursos vinculados aos alunos.",
      to: "/admin/matriculas",
    },
  ];

  const columns = [
    { key: "student", label: "Aluno" },
    { key: "registration_number", label: "Matrícula" },
    { key: "cpf", label: "CPF" },
    { key: "phone", label: "Telefone" },
    { key: "status", label: "Status" },
    { key: "actions", label: "Ações", align: "right" },
  ];

  const activeFilterCount =
    [draft.courseId, draft.classId].filter(Boolean).length +
    (draft.status && draft.status !== INITIAL_DRAFT.status ? 1 : 0);

  return (
    <>
      <ManagementPageShell
        backTo="/admin/dashboard-admin"
        title="Gerenciamento de Alunos"
        description="Acompanhe alunos cadastrados, cursos, status e progresso."
        createButtonText="+ Novo Aluno"
        onCreateClick={handleCreateClick}
        stats={hasApplied ? stats : []}
        tableTitle="Lista de alunos"
        tableActions={
          <MobileFilterToggle activeCount={activeFilterCount}>
            <select
              value={draft.courseId}
              onChange={(event) => updateDraft({ courseId: event.target.value, classId: "" })}
              className={inputClass}
            >
              <option value="">Todos os cursos</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>

            <select
              value={draft.classId}
              onChange={(event) => updateDraft({ classId: event.target.value })}
              disabled={!draft.courseId}
              className={inputClass}
            >
              <option value="">Todas as turmas</option>
              {filterClasses.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name}
                </option>
              ))}
            </select>

            <AdminStatusFilter
              value={draft.status}
              onChange={(value) => updateDraft({ status: value })}
              options={studentStatusOptions}
            />

            <button
              type="button"
              onClick={apply}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Aplicar filtros
            </button>

            {hasApplied && (
              <button
                type="button"
                onClick={clear}
                className="text-sm font-semibold text-gray-500 hover:text-gray-700 hover:underline"
              >
                Limpar filtros
              </button>
            )}
          </MobileFilterToggle>
        }
        searchValue={busca}
        onSearchChange={setBusca}
        searchPlaceholder="Buscar aluno..."
        quickActions={quickActions}
      >
        {!hasApplied && (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
            <p className="font-semibold text-gray-700">Selecione um filtro para consultar os alunos.</p>
            <p className="mt-2 text-sm text-gray-500">Escolha um curso específico ou deixe em "Todos os cursos"; turma e status são refinamentos opcionais.</p>
          </div>
        )}

        {hasApplied && isStale && (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
            Os filtros foram alterados -- clique em "Aplicar filtros" para atualizar os resultados abaixo.
          </p>
        )}

        {hasApplied && loading && (
          <p className="py-6 text-center text-gray-500">
            Carregando alunos...
          </p>
        )}

        {hasApplied && !loading && error && (
          <p className="py-6 text-center text-red-500">{error}</p>
        )}

        {hasApplied && !loading && !error && (
          <AdminTable
            columns={columns}
            data={filteredStudents}
            emptyMessage="Nenhum aluno encontrado para os filtros aplicados."
            renderRow={(student) => (
              <tr key={student.id} className="border-b border-gray-100">
                <td className="px-3 py-3">
                  <p className="text-sm font-semibold text-gray-900">{student.name}</p>
                  <p className="text-xs text-gray-500">{student.email}</p>
                </td>

                <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">
                  {student.registration_number || "-"}
                </td>

                <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">{student.cpf || "-"}</td>
                <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">{student.phone || "-"}</td>

                <td className="whitespace-nowrap px-3 py-3">
                  <StatusBadge status={student.status} />
                </td>

                <td className="whitespace-nowrap px-3 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <TableActionButton variant="accent" size="sm" onClick={() => handleEditClick(student)}>
                      Editar
                    </TableActionButton>

                    <RowActionsMenu
                      items={[
                        {
                          key: "delete",
                          label: "Remover",
                          icon: Trash2,
                          variant: "danger",
                          onClick: () => handleDeleteClick(student),
                        },
                      ]}
                    />
                  </div>
                </td>
              </tr>
            )}
            renderMobileCard={(student) => (
              <MobileExpandableCard
                key={student.id}
                title={student.name}
                subtitle={student.email}
                badge={<StatusBadge status={student.status} size="sm" />}
                primaryAction={
                  <div className="flex items-center gap-2">
                    <TableActionButton
                      variant="accent"
                      size="md"
                      className="flex-1"
                      onClick={() => handleEditClick(student)}
                    >
                      Editar
                    </TableActionButton>

                    <RowActionsMenu
                      items={[
                        {
                          key: "delete",
                          label: "Remover",
                          icon: Trash2,
                          variant: "danger",
                          onClick: () => handleDeleteClick(student),
                        },
                      ]}
                    />
                  </div>
                }
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Matrícula</span>
                  <span className="font-medium text-gray-900">
                    {student.registration_number || "-"}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">CPF</span>
                  <span className="font-medium text-gray-900">{student.cpf || "-"}</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Telefone</span>
                  <span className="font-medium text-gray-900">{student.phone || "-"}</span>
                </div>
              </MobileExpandableCard>
            )}
          />
        )}
      </ManagementPageShell>

      {modalOpen && (
        <AdminCreateEditModal
          variant="student"
          mode={modalMode}
          initialData={selectedStudent}
          handleCloseModal={() => setModalOpen(false)}
          onSuccess={fetchStudents}
        />
      )}

      {deleteModalOpen && (
        <DeleteConfirmModal
          title="Remover aluno"
          description="Tem certeza que deseja remover este aluno?"
          itemName={selectedStudent?.name}
          loading={loadingDelete}
          onCancel={() => setDeleteModalOpen(false)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </>
  );
}
