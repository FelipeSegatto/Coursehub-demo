import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Eye, Trash2 } from "lucide-react";
import { apiFetch } from "../../services/APIService";

import ManagementPageShell from "../../components/ui/ManagementPageShell";
import AdminCreateEditModal from "../../components/admin/AdminCreateEditModal";
import DeleteConfirmModal from "../../components/admin/AdminDeleteModal";
import CourseDetailsModal from "../../components/admin/CourseDetailsModal";
import AdminTable from "../../components/admin/AdminTable";
import AdminStatusFilter from "../../components/admin/AdminStatusFilter";
import StatusBadge from "../../components/ui/StatusBadge";
import TableActionButton from "../../components/ui/actions/TableActionButton";
import RowActionsMenu from "../../components/ui/actions/RowActionsMenu";
import MobileExpandableCard from "../../components/ui/MobileExpandableCard";

function formatCurrency(value) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * "Ana, João +1" -- não tenta caber todos os professores quando são
 * muitos, só os dois primeiros + contagem do resto. Cai para
 * teacher_name (legado) só se o curso não tiver nenhum professor em
 * course_teachers ainda.
 */
function formatCourseTeachers(course) {
  const teachers = Array.isArray(course.teachers) ? course.teachers : [];

  if (teachers.length === 0) {
    return course.teacher_name || "-";
  }

  const visible = teachers.slice(0, 2).map((teacher) => teacher.name);
  const remaining = teachers.length - visible.length;

  return remaining > 0 ? `${visible.join(", ")} +${remaining}` : visible.join(", ");
}

/**
 * course_pricing_plans é a única fonte de preço -- nunca course.price.
 * Só a primeira linha (o valor que importa pra comparar cursos numa
 * lista) aparece aqui -- o detalhamento de mensalidade fica no modal
 * "Ver", pra a coluna não brigar por espaço com o nome do curso.
 */
function PricingCell({ pricing }) {
  if (!pricing?.hasActivePlans) {
    return <span className="text-xs text-gray-400">Consulte os valores</span>;
  }

  return (
    <p className="whitespace-nowrap text-xs font-semibold tabular-nums text-gray-900">
      A partir de {formatCurrency(pricing.startingPrice)}
    </p>
  );
}

const courseStatusOptions = [
  { value: "", label: "Todos" },
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
  { value: "draft", label: "Rascunhos" },
  { value: "archived", label: "Arquivados" },
];

export default function CourseAdmin() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [courses, setCourses] = useState([]);
  const [busca, setBusca] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [selectedCourse, setSelectedCourse] = useState(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);

  const [viewTarget, setViewTarget] = useState(null);

  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "active");

  // Ex.: deep link do dashboard (/admin/cursos?status=active) --
  // filtragem já é imediata (useMemo abaixo), só precisa manter a URL
  // sincronizada para sobreviver a um refresh.
  useEffect(() => {
    setSearchParams(statusFilter ? { status: statusFilter } : {}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function fetchCourses() {
    try {
      setLoading(true);
      setError("");

      const response = await apiFetch("/api/admin/courses");

      const courseList = Array.isArray(response)
        ? response
        : Array.isArray(response?.courses)
          ? response.courses
          : Array.isArray(response?.data)
            ? response.data
            : [];

      setCourses(courseList);
    } catch (error) {
      console.error("Erro ao buscar cursos:", error);

      setCourses([]);

      setError(
        error.message || "Erro ao buscar cursos."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCourses();
  }, []);

  function handleCreateClick() {
    setModalMode("create");
    setSelectedCourse(null);
    setModalOpen(true);
  }

  function handleEditClick(course) {
    setModalMode("edit");
    setSelectedCourse(course);
    setModalOpen(true);
  }

  function handleCloseModal() {
    setModalOpen(false);
    setModalMode("create");
    setSelectedCourse(null);
  }

  async function handleCourseSuccess() {
    await fetchCourses();
    handleCloseModal();
  }

  function handleDeleteClick(course) {
    /*
     * Corrigido:
     * antes estava salvando o array completo `courses`.
     */
    setSelectedCourse(course);
    setDeleteModalOpen(true);
  }

  function handleCloseDeleteModal() {
    if (loadingDelete) return;

    setDeleteModalOpen(false);
    setSelectedCourse(null);
  }

  async function handleConfirmDelete() {
    if (!selectedCourse?.id || loadingDelete) {
      return;
    }

    try {
      setLoadingDelete(true);
      setError("");

      await apiFetch(
        `/api/admin/courses/${selectedCourse.id}`,
        {
          method: "DELETE",
        }
      );

      /*
       * Atualização local imediata.
       *
       * Ajuste "inactive" caso sua rota DELETE use
       * outro status para soft delete.
       */
      setCourses((previousCourses) =>
        previousCourses.map((course) =>
          course.id === selectedCourse.id
            ? {
                ...course,
                status: "inactive",
              }
            : course
        )
      );

      handleCloseDeleteModal();
    } catch (error) {
      console.error("Erro ao remover curso:", error);

      setError(
        error.message || "Erro ao remover curso."
      );
    } finally {
      setLoadingDelete(false);
    }
  }

  const filteredCourses = useMemo(() => {
    const term = busca.trim().toLowerCase();

    return courses.filter((course) => {
      const name =
        course.name?.toLowerCase() || "";

      const category =
        course.category?.toLowerCase() || "";

      // Busca considera todos os professores vinculados (N:N), não só
      // o teacher_name legado -- um curso com Ana e João precisa
      // aparecer buscando por "joão", mesmo que teacher_name (legado)
      // ainda aponte só para Ana.
      const teacherNames = (
        (course.teachers || []).map((teacher) => teacher.name)
      )
        .concat(course.teacher_name || "")
        .join(" ")
        .toLowerCase();

      const status =
        course.status?.toLowerCase() || "";

      const matchesSearch =
        !term ||
        name.includes(term) ||
        category.includes(term) ||
        teacherNames.includes(term) ||
        status.includes(term);

      const matchesStatus =
        !statusFilter ||
        course.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [courses, busca, statusFilter]);

  const stats = useMemo(() => {
    return [
      {
        title: "Total de cursos",
        value: courses.length,
      },
      {
        title: "Cursos ativos",
        value: courses.filter(
          (course) => course.status === "active"
        ).length,
      },
      {
        title: "Rascunhos/Inativos",
        value: courses.filter(
          (course) =>
            course.status === "draft" ||
            course.status === "inactive"
        ).length,
      },
      {
        title: "Matrículas totais",
        value: courses.reduce(
          (total, course) =>
            total +
            Number(course.total_students || 0),
          0
        ),
      },
    ];
  }, [courses]);

  const quickActions = [
    {
      title: "Cadastrar curso",
      description:
        "Adicione um novo curso à plataforma.",
      onClick: handleCreateClick,
    },
    {
      title: "Gerenciar acessos",
      description:
        "Edite status, bloqueios e dados cadastrais.",
      to:"/admin/usuarios"
    },
    {
      title: "Acompanhar métricas dos cursos",
      description:
        "Veja o desempenho dos cursos.",
      disabled: true,
      disabledReason: "Em breve — ainda não há uma página dedicada para isso.",
    },
  ];

  const columns = [
    {
      key: "course",
      label: "Curso",
    },
    {
      key: "teacher_name",
      label: "Docente",
    },
    {
      key: "total_students",
      label: "Alunos matriculados",
      align: "right",
    },
    {
      key: "workload_hours",
      label: "Carga horária",
      align: "right",
    },
    {
      key: "pricing",
      label: "Preço",
      align: "right",
    },
    {
      key: "status",
      label: "Status",
    },
    {
      key: "actions",
      label: "Ações",
      align: "right",
    },
  ];

  return (
    <>
      <ManagementPageShell
        backTo="/admin/dashboard-admin"
        title="Gerenciamento de cursos"
        description="Acompanhe cursos cadastrados, turmas e outras métricas."
        createButtonText="+ Novo curso"
        onCreateClick={handleCreateClick}
        stats={stats}
        tableTitle="Lista de cursos"
        tableActions={
          <AdminStatusFilter
            value={statusFilter}
            onChange={setStatusFilter}
            options={courseStatusOptions}
          />
        }
        searchValue={busca}
        onSearchChange={setBusca}
        searchPlaceholder="Buscar curso, professor ou categoria..."
        quickActions={quickActions}
      >
        {loading && (
          <p className="py-6 text-center text-gray-500">
            Carregando cursos...
          </p>
        )}

        {!loading && error && (
          <p className="py-6 text-center text-red-500">
            {error}
          </p>
        )}

        {!loading && !error && (
          <AdminTable
            columns={columns}
            data={filteredCourses}
            emptyMessage="Nenhum curso encontrado."
            renderRow={(course) => (
              <tr
                key={course.id}
                className="border-b border-gray-100"
              >
                <td className="px-3 py-3">
                  <p className="text-sm font-semibold text-gray-900">
                    {course.name}
                  </p>

                  {course.category && (
                    <p className="mt-1 text-xs text-gray-500">
                      {course.category}
                    </p>
                  )}
                </td>

                <td className="px-3 py-3 text-sm text-gray-600">
                  {formatCourseTeachers(course)}
                </td>

                <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-gray-600">
                  {Number(
                    course.total_students || 0
                  )}
                </td>

                <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-gray-600">
                  {course.workload_hours
                    ? `${course.workload_hours}h`
                    : "-"}
                </td>

                <td className="whitespace-nowrap px-3 py-3 text-right">
                  <PricingCell pricing={course.pricing} />
                </td>

                <td className="whitespace-nowrap px-3 py-3">
                  <StatusBadge
                    status={course.status}
                  />
                </td>

                <td className="whitespace-nowrap px-3 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <TableActionButton
                      variant="neutral"
                      size="sm"
                      onClick={() => setViewTarget(course)}
                    >
                      Ver
                    </TableActionButton>

                    <TableActionButton
                      variant="accent"
                      size="sm"
                      onClick={() => handleEditClick(course)}
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
                          onClick: () => handleDeleteClick(course),
                        },
                      ]}
                    />
                  </div>
                </td>
              </tr>
            )}
            renderMobileCard={(course) => (
              <MobileExpandableCard
                key={course.id}
                title={course.name}
                subtitle={course.category}
                badge={<StatusBadge status={course.status} size="sm" />}
                primaryAction={
                  <div className="flex items-center gap-2">
                    <TableActionButton
                      variant="accent"
                      size="md"
                      className="flex-1"
                      onClick={() => handleEditClick(course)}
                    >
                      Editar
                    </TableActionButton>

                    <RowActionsMenu
                      items={[
                        {
                          key: "view",
                          label: "Ver detalhes",
                          icon: Eye,
                          variant: "neutral",
                          onClick: () => setViewTarget(course),
                        },
                        {
                          key: "delete",
                          label: "Remover",
                          icon: Trash2,
                          variant: "danger",
                          separator: true,
                          onClick: () => handleDeleteClick(course),
                        },
                      ]}
                    />
                  </div>
                }
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Docente</span>
                  <span className="font-medium text-gray-900">{formatCourseTeachers(course)}</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Alunos matriculados</span>
                  <span className="font-medium text-gray-900">
                    {Number(course.total_students || 0)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Carga horária</span>
                  <span className="font-medium text-gray-900">
                    {course.workload_hours ? `${course.workload_hours}h` : "-"}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Preço</span>
                  <PricingCell pricing={course.pricing} />
                </div>
              </MobileExpandableCard>
            )}
          />
        )}
      </ManagementPageShell>

      {modalOpen && (
        <AdminCreateEditModal
          variant="course"
          mode={modalMode}
          initialData={selectedCourse}
          handleCloseModal={handleCloseModal}
          onSuccess={handleCourseSuccess}
        />
      )}

      {deleteModalOpen && (
        <DeleteConfirmModal
          title="Remover curso"
          description="Tem certeza que deseja remover este curso?"
          itemName={selectedCourse?.name}
          loading={loadingDelete}
          onCancel={handleCloseDeleteModal}
          onConfirm={handleConfirmDelete}
        />
      )}

      <CourseDetailsModal
        open={Boolean(viewTarget)}
        course={viewTarget}
        onClose={() => setViewTarget(null)}
      />
    </>
  );
}