import { useCallback, useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { apiFetch } from "../../services/APIService";

import ManagementPageShell from "../ui/ManagementPageShell";
import ActivityModal from "./ActivityModal";
import DeleteModal from "./DeleteModal";
import TeacherTable from "./TeacherTable";
import TeacherStatusFilter from "./TeacherStatusFilter";
import TableActionButton from "../ui/actions/TableActionButton";
import RowActionsMenu from "../ui/actions/RowActionsMenu";

import StatusBadge from "../ui/StatusBadge";
import MobileExpandableCard from "../ui/MobileExpandableCard";

const statusOptions = [
  { value: "", label: "Todos" },
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
  { value: "draft", label: "Rascunhos" },
  { value: "archived", label: "Arquivados" },
];

const typeLabels = {
  mixed: "Mista",
  quiz: "Questionário",
  text: "Discursiva",
  upload: "Envio de arquivo",
};

function formatDate(date) {
  if (!date) return "Sem prazo";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Data inválida";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsedDate);
}

function formatScore(score) {
  const numericScore = Number(score);

  if (Number.isNaN(numericScore)) {
    return "10,00";
  }

  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numericScore);
}

export default function TeacherActivitiesPage({
  activityKind,
  pageTitle,
  pageDescription,
  createButtonText,
  tableTitle,
  emptyMessage,
  createActionTitle,
  createActionDescription,
}) {
  const { usuarioLogado } = useAuth();

  const [courses, setCourses] = useState([]);
  const [classes, setClasses] = useState([]);
  const [allActivities, setAllActivities] = useState([]);

  const [selectedActivity, setSelectedActivity] = useState(null);
  const [selectedActivityToDelete, setSelectedActivityToDelete] =
    useState(null);

  const [busca, setBusca] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");

  const [loading, setLoading] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  async function loadActivities() {
    if (!usuarioLogado?.id) return;

    const endpoint =
      `/api/teacher/by-user/${usuarioLogado.id}/activities`;

    console.log(
      "Buscando atividades do professor:",
      endpoint
    );

    const data = await apiFetch(endpoint);

    console.log(
      "Atividades recebidas:",
      data
    );

    setAllActivities(
      Array.isArray(data) ? data : []
    );
  }

  async function loadCourses() {
    if (!usuarioLogado?.id) return;

    const endpoint =
      `/api/teacher/by-user/${usuarioLogado.id}/courses`;

    console.log(
      "Buscando cursos do professor:",
      endpoint
    );

    const data = await apiFetch(endpoint);

    console.log(
      "Cursos recebidos:",
      data
    );

    setCourses(
      Array.isArray(data) ? data : []
    );
  }

  /*
   * Busca as turmas do professor. A busca de turmas falhando
   * não bloqueia a listagem de atividades — o professor ainda
   * pode ver e criar atividades gerais normalmente.
   */
  async function loadClasses() {
    if (!usuarioLogado?.id) return;

    const endpoint =
      `/api/teacher/by-user/${usuarioLogado.id}/classes`;

    try {
      const data = await apiFetch(endpoint);

      const classList = Array.isArray(data)
        ? data
        : Array.isArray(data?.classes)
          ? data.classes
          : Array.isArray(data?.data)
            ? data.data
            : [];

      setClasses(classList);
    } catch (classesError) {
      console.error(
        "Erro ao buscar turmas do professor:",
        classesError
      );

      setClasses([]);
    }
  }

  useEffect(() => {
    if (!usuarioLogado?.id) return;

    async function loadPageData() {
      try {
        setLoading(true);
        setError("");

        await Promise.all([
          loadActivities(),
          loadCourses(),
          loadClasses(),
        ]);
      } catch (error) {
        console.error("Erro ao carregar página:", error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    }

    loadPageData();
  }, [usuarioLogado?.id]);

  const activitiesByKind = useMemo(() => {
    return allActivities.filter(
      (activity) => activity.activity_kind === activityKind
    );
  }, [allActivities, activityKind]);

  /*
   * Resolve o nome de exibição da turma de uma atividade.
   * Nunca mostra o ID cru — se class_name/className não vier da
   * API, tenta resolver pelo array de turmas carregado; se ainda
   * assim não achar, cai para um rótulo genérico.
   */
  const resolveActivityClassName = useCallback(
    (activity) => {
      const classId = activity.classId ?? activity.class_id ?? null;

      if (!classId) return null;

      const nameFromActivity =
        activity.className || activity.class_name;

      if (nameFromActivity) return nameFromActivity;

      const matchedClass = classes.find(
        (classItem) => Number(classItem.id) === Number(classId)
      );

      return matchedClass?.name || "Turma específica";
    },
    [classes]
  );

  const filteredActivities = useMemo(() => {
    const term = busca.trim().toLowerCase();

    return activitiesByKind.filter((activity) => {
      const title = activity.title?.toLowerCase() || "";
      const description = activity.description?.toLowerCase() || "";
      const courseName =
        activity.course_name?.toLowerCase() ||
        activity.course_title?.toLowerCase() ||
        "";
      const type = activity.type?.toLowerCase() || "";
      const status = activity.status?.toLowerCase() || "";

      const className = (
        resolveActivityClassName(activity) || "todas as turmas"
      ).toLowerCase();

      const matchesSearch =
        !term ||
        title.includes(term) ||
        description.includes(term) ||
        courseName.includes(term) ||
        type.includes(term) ||
        status.includes(term) ||
        className.includes(term);

      const matchesStatus =
        !statusFilter || activity.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [
    activitiesByKind,
    busca,
    statusFilter,
    resolveActivityClassName,
  ]);

  const stats = useMemo(() => {
    return [
      {
        title:
          activityKind === "exam"
            ? "Total de avaliações"
            : "Total de atividades",
        value: activitiesByKind.length,
      },
      {
        title: "Ativos",
        value: activitiesByKind.filter(
          (activity) => activity.status === "active"
        ).length,
      },
      {
        title: "Rascunhos/Inativos",
        value: activitiesByKind.filter(
          (activity) =>
            activity.status === "draft" ||
            activity.status === "inactive"
        ).length,
      },
      {
        title: "Obrigatórios",
        value: activitiesByKind.filter(
          (activity) =>
            activity.is_required === 1 ||
            activity.is_required === true
        ).length,
      },
    ];
  }, [activitiesByKind, activityKind]);

  function handleCreateClick() {
    setModalMode("create");
    setSelectedActivity(null);
    setModalOpen(true);
  }

  function handleEditClick(activity) {
    setModalMode("edit");
    setSelectedActivity(activity);
    setModalOpen(true);
  }

  function handleCloseModal() {
    setModalOpen(false);
    setSelectedActivity(null);
    setModalMode("create");
  }

  async function handleActivitySuccess() {
    await loadActivities();
    handleCloseModal();
  }

  function handleDeleteClick(activity) {
    setSelectedActivityToDelete(activity);
    setDeleteModalOpen(true);
  }

  function handleCloseDeleteModal() {
    if (loadingDelete) return;

    setSelectedActivityToDelete(null);
    setDeleteModalOpen(false);
  }

  async function handleDeleteActivity(activity) {
    if (!activity?.id || loadingDelete) return;

    try {
      setLoadingDelete(true);
      setError("");

      try {
        await apiFetch(
          `/api/activities/${activity.id}`,
          {
            method: "DELETE",
            body: JSON.stringify({
              userId: usuarioLogado.id,
            }),
          }
        );
      } catch (deleteActivityError) {
        throw new Error(
          deleteActivityError.data?.message ||
            `Erro ao remover ${
              activityKind === "exam" ? "avaliação" : "atividade"
            }.`,
          { cause: deleteActivityError }
        );
      }

      setAllActivities((previousActivities) =>
        previousActivities.map((currentActivity) =>
          currentActivity.id === activity.id
            ? {
                ...currentActivity,
                status: "archived",
              }
            : currentActivity
        )
      );

      handleCloseDeleteModal();
    } catch (error) {
      console.error("Erro ao arquivar atividade:", error);
      setError(error.message);
    } finally {
      setLoadingDelete(false);
    }
  }

  const quickActions = [
    {
      title: createActionTitle,
      description: createActionDescription,
      onClick: handleCreateClick,
    },
    {
      title: "Acompanhar desempenho",
      description:
        activityKind === "exam"
          ? "Veja notas e desempenho dos alunos nas avaliações."
          : "Veja notas e progresso dos alunos nas atividades.",
      to: "/professor/notas",
    },
  ];

  const columns = [
    {
      key: "title",
      label: activityKind === "exam" ? "Avaliação" : "Atividade",
    },
    { key: "course", label: "Curso" },
    { key: "class", label: "Turma" },
    { key: "type", label: "Tipo" },
    { key: "due_date", label: "Prazo" },
    { key: "max_score", label: "Nota máxima", align: "right" },
    { key: "status", label: "Status" },
    { key: "actions", label: "Ações", align: "right" },
  ];

  return (
    <>
      <ManagementPageShell
        backTo="/professor/dashboard-professor"
        title={pageTitle}
        description={pageDescription}
        createButtonText={createButtonText}
        onCreateClick={handleCreateClick}
        stats={stats}
        tableTitle={tableTitle}
        tableActions={
          <TeacherStatusFilter
            value={statusFilter}
            onChange={setStatusFilter}
            options={statusOptions}
          />
        }
        searchValue={busca}
        onSearchChange={setBusca}
        searchPlaceholder={
          activityKind === "exam"
            ? "Buscar avaliação, curso ou tipo..."
            : "Buscar atividade, curso ou tipo..."
        }
        quickActions={quickActions}
      >
        {loading && (
          <p className="py-6 text-center text-gray-500">
            Carregando...
          </p>
        )}

        {!loading && error && (
          <p className="py-6 text-center text-red-500">
            {error}
          </p>
        )}

        {!loading && !error && (
          <TeacherTable
            columns={columns}
            data={filteredActivities}
            emptyMessage={emptyMessage}
            renderRow={(activity) => (
              <tr
                key={activity.id}
                className="border-b border-gray-100"
              >
                <td className="px-3 py-3">
                  <p className="text-sm font-semibold text-gray-900">
                    {activity.title}
                  </p>

                  {activity.description && (
                    <p className="mt-1 max-w-md truncate text-xs text-gray-500">
                      {activity.description}
                    </p>
                  )}
                </td>

                <td className="px-3 py-3 text-sm text-gray-600">
                  {activity.course_name ||
                    activity.course_title ||
                    `Curso #${activity.course_id}`}
                </td>

                <td className="px-3 py-3 text-sm text-gray-600">
                  {resolveActivityClassName(activity) ||
                    "Todas as turmas"}
                </td>

                <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">
                  {typeLabels[activity.type] || activity.type || "-"}
                </td>

                <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">
                  {formatDate(activity.due_date)}
                </td>

                <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-gray-600">
                  {formatScore(activity.max_score)}
                </td>

                <td className="whitespace-nowrap px-3 py-3">
                  <StatusBadge status={activity.status} />
                </td>

                <td className="whitespace-nowrap px-3 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <TableActionButton
                      variant="accent"
                      size="sm"
                      to={
                        activity.activity_kind === "exam"
                          ? `/professor/avaliacoes/${activity.id}/envios`
                          : `/professor/atividades/${activity.id}/envios`
                      }
                    >
                      Ver envios
                    </TableActionButton>

                    <TableActionButton
                      variant="neutral"
                      size="sm"
                      onClick={() => handleEditClick(activity)}
                    >
                      Editar
                    </TableActionButton>

                    <RowActionsMenu
                      items={[
                        {
                          key: "remove",
                          label: "Remover",
                          icon: Trash2,
                          variant: "danger",
                          onClick: () => handleDeleteClick(activity),
                        },
                      ]}
                    />
                  </div>
                </td>
              </tr>
            )}
            renderMobileCard={(activity) => (
              <MobileExpandableCard
                key={activity.id}
                title={activity.title}
                subtitle={activity.description}
                badge={<StatusBadge status={activity.status} size="sm" />}
                primaryAction={
                  <div className="flex items-center gap-2">
                    <TableActionButton
                      variant="accent"
                      size="md"
                      className="flex-1"
                      to={
                        activity.activity_kind === "exam"
                          ? `/professor/avaliacoes/${activity.id}/envios`
                          : `/professor/atividades/${activity.id}/envios`
                      }
                    >
                      Ver envios
                    </TableActionButton>

                    <RowActionsMenu
                      items={[
                        {
                          key: "remove",
                          label: "Remover",
                          icon: Trash2,
                          variant: "danger",
                          onClick: () => handleDeleteClick(activity),
                        },
                      ]}
                    />
                  </div>
                }
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Curso</span>
                  <span className="font-medium text-gray-900">
                    {activity.course_name ||
                      activity.course_title ||
                      `Curso #${activity.course_id}`}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Turma</span>
                  <span className="font-medium text-gray-900">
                    {resolveActivityClassName(activity) || "Todas as turmas"}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Tipo</span>
                  <span className="font-medium text-gray-900">
                    {typeLabels[activity.type] || activity.type || "-"}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Prazo</span>
                  <span className="font-medium text-gray-900">
                    {formatDate(activity.due_date)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Nota máxima</span>
                  <span className="font-medium text-gray-900">
                    {formatScore(activity.max_score)}
                  </span>
                </div>

                <div className="pt-1">
                  <TableActionButton
                    variant="neutral"
                    size="sm"
                    className="w-full"
                    onClick={() => handleEditClick(activity)}
                  >
                    Editar
                  </TableActionButton>
                </div>
              </MobileExpandableCard>
            )}
          />
        )}
      </ManagementPageShell>

      {modalOpen && (
        <ActivityModal
            mode={modalMode}
            activity={selectedActivity}
            courses={courses}
            classes={classes}
            activityKind={activityKind}
            userId={usuarioLogado.id}
            handleCloseModal={handleCloseModal}
            onSuccess={handleActivitySuccess}
        />
        )}

      {deleteModalOpen && (
        <DeleteModal
          item={selectedActivityToDelete}
          variant={activityKind}
          loading={loadingDelete}
          handleCloseModal={handleCloseDeleteModal}
          onConfirm={handleDeleteActivity}
        />
      )}
    </>
  );
}