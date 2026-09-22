import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../services/APIService";

import StudentManagementPage from "./StudentManagementPage";
import StudentTable from "./StudentTable";
import StudentStatusFilter from "./StudentStatusFilter";
import StatusBadge from "../ui/StatusBadge";
import TableActionButton from "../ui/actions/TableActionButton";
import MobileExpandableCard from "../ui/MobileExpandableCard";



const statusOptions = [
  { value: "", label: "Todos" },
  { value: "pending", label: "Pendentes" },
  { value: "overdue", label: "Atrasadas" },
  { value: "submitted", label: "Entregues" },
  { value: "graded", label: "Corrigidas" },
  { value: "returned", label: "Devolvidas" },
];



function formatDate(dateString) {
  if (!dateString) return "Sem prazo";

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "Data inválida";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function getActivityStatus(activity) {
  if (activity.submission_status === "graded") {
    return "graded";
  }

  if (
    activity.submission_status === "pending_review" ||
    activity.submission_status === "submitted"
  ) {
    return "submitted";
  }

  if (activity.submission_status === "returned") {
    return "returned";
  }

  if (
    activity.due_date &&
    new Date(activity.due_date) < new Date()
  ) {
    return "overdue";
  }

  return "pending";
}


export default function StudentActivitiesList({
  title,
  description,
  listTitle,
  searchPlaceholder,
  emptyMessage,
  actionPendingLabel,
  detailsPath,
  activityKind,
}) {
  const [activities, setActivities] = useState([]);
  const [busca, setBusca] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
  async function loadActivities() {
    try {
      setLoading(true);
      setError("");

      const data = await apiFetch(
        "/api/students/by-user/activities"
      );

      setActivities(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(
        "Erro ao carregar atividades:",
        error
      );

      /*
       * Nunca mantém atividades antigas na tela após uma
       * resposta inválida (ex.: 403/404).
       */
      setActivities([]);
      setError(
        error.data?.message ||
          error.message ||
          "Não foi possível carregar as atividades."
      );
    } finally {
      setLoading(false);
    }
  }

  loadActivities();
}, []);

  const activitiesByKind = useMemo(() => {
    return activities.filter(
      (activity) =>
        !activityKind ||
        activity.activity_kind === activityKind
    );
  }, [activities, activityKind]);

  const formattedActivities = useMemo(() => {
    return activitiesByKind.map((activity) => {
      const status = getActivityStatus(activity);

      /*
      * Aceita tanto grade quanto score.
      *
      * A rota atual devolve os dois campos, mas isso
      * mantém o componente tolerante a outras rotas.
      */
      const rawGrade =
        activity.grade ??
        activity.score;

      const grade =
        rawGrade !== null &&
        rawGrade !== undefined
          ? Number(rawGrade).toFixed(1)
          : "-";

      return {
        id: activity.id,
        title: activity.title,

        courseTitle:
          activity.course_title ||
          activity.course_name ||
          `Curso #${activity.course_id}`,

        dueDate: formatDate(
          activity.due_date
        ),

        status,
        grade,
        original: activity,
      };
    });
  }, [activitiesByKind]);

  const filteredActivities = useMemo(() => {
    const term = busca.trim().toLowerCase();

    return formattedActivities.filter((activity) => {
      const matchesSearch =
        !term ||
        activity.title
          ?.toLowerCase()
          .includes(term) ||
        activity.courseTitle
          ?.toLowerCase()
          .includes(term);

      const matchesStatus =
        !statusFilter ||
        activity.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [
    formattedActivities,
    busca,
    statusFilter,
  ]);

  const stats = useMemo(() => {
  /*
   * Pendentes incluem:
   * - ainda não realizadas;
   * - atrasadas;
   * - devolvidas para ajustes.
   */
  const pending = formattedActivities.filter(
    (activity) =>
      activity.status === "pending" ||
      activity.status === "overdue" ||
      activity.status === "returned"
  ).length;

  /*
   * Entregas enviadas que ainda aguardam correção.
   */
  const submitted = formattedActivities.filter(
    (activity) =>
      activity.status === "submitted"
  ).length;

  /*
   * Entregas já corrigidas.
   */
  const graded = formattedActivities.filter(
    (activity) =>
      activity.status === "graded"
  ).length;

  /*
   * Calcula a média apenas com atividades
   * que possuem nota.
   */
  const grades = formattedActivities
    .filter(
      (activity) => activity.grade !== "-"
    )
    .map((activity) =>
      Number(activity.grade)
    )
    .filter(
      (grade) => !Number.isNaN(grade)
    );

  const average =
    grades.length > 0
      ? (
          grades.reduce(
            (total, grade) =>
              total + grade,
            0
          ) / grades.length
        ).toFixed(1)
      : "-";

  return [
    {
      title:
        activityKind === "exam"
          ? "Avaliações pendentes"
          : "Atividades pendentes",
      value: pending,
      color: "yellow",
    },
    {
      title: "Aguardando correção",
      value: submitted,
      color: "blue",
    },
    {
      title: "Corrigidas",
      value: graded,
      color: "green",
    },
    {
      title:
        activityKind === "exam"
          ? "Média nas avaliações"
          : "Média nas atividades",
      value: average,
      color: "purple",
    },
  ];
}, [
  formattedActivities,
  activityKind,
]);

  const columns = [
    { key: "title", label: "Título" },
    { key: "course", label: "Curso" },
    { key: "dueDate", label: "Prazo" },
    { key: "status", label: "Status" },
    { key: "actions", label: "Ações", align: "right" },
  ];

  return (
    <StudentManagementPage
      title={title}
      description={description}
      stats={stats}
      tableTitle={listTitle}
      tableActions={
        <StudentStatusFilter
          value={statusFilter}
          onChange={setStatusFilter}
          options={statusOptions}
        />
      }
      searchValue={busca}
      onSearchChange={setBusca}
      searchPlaceholder={searchPlaceholder}
      backTo="/aluno/dashboard-aluno"
      backLabel="Voltar ao dashboard"
    >
      {loading && (
        <p className="py-8 text-center text-gray-500">
          Carregando...
        </p>
      )}

      {!loading && error && (
        <p className="py-8 text-center text-red-500">
          {error}
        </p>
      )}

      {!loading && !error && (
        <>
          {/* Desktop/tablet: tabela completa */}
          <div className="hidden md:block">
            <StudentTable
              columns={columns}
              data={filteredActivities}
              emptyMessage={emptyMessage}
              renderRow={(activity) => {
                const isPending =
                  activity.status === "pending" ||
                  activity.status === "overdue" ||
                  activity.status === "returned";

                return (
                  <tr
                    key={activity.id}
                    className="border-b border-gray-100"
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-gray-900">
                        {activity.title}
                      </p>

                      <p className="mt-1 text-xs text-gray-500">
                        ID: #{activity.id}
                      </p>
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-600">
                      {activity.courseTitle}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                      {activity.dueDate}
                    </td>

                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge status={activity.status} />
                    </td>

                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <TableActionButton
                        variant={isPending ? "accent" : "neutral"}
                        size="sm"
                        to={`${detailsPath}/${activity.id}`}
                      >
                        {isPending
                          ? actionPendingLabel
                          : "Ver detalhes"}
                      </TableActionButton>
                    </td>
                  </tr>
                );
              }}
            />
          </div>

          {/* Mobile: cards com título e ação sempre visíveis; detalhes só ao expandir */}
          <div className="space-y-3 md:hidden">
            {filteredActivities.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">
                {emptyMessage}
              </p>
            ) : (
              filteredActivities.map((activity) => {
                const isPending =
                  activity.status === "pending" ||
                  activity.status === "overdue" ||
                  activity.status === "returned";

                return (
                  <MobileExpandableCard
                    key={activity.id}
                    title={activity.title}
                    subtitle={activity.courseTitle}
                    badge={<StatusBadge status={activity.status} size="sm" />}
                    primaryAction={
                      <TableActionButton
                        variant={isPending ? "accent" : "neutral"}
                        size="md"
                        to={`${detailsPath}/${activity.id}`}
                        className="w-full"
                      >
                        {isPending
                          ? actionPendingLabel
                          : "Ver detalhes"}
                      </TableActionButton>
                    }
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Prazo</span>
                      <span className="font-medium text-gray-900">
                        {activity.dueDate}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Nota</span>
                      <span className="font-medium text-gray-900">
                        {activity.grade}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">ID</span>
                      <span className="font-medium text-gray-900">
                        #{activity.id}
                      </span>
                    </div>
                  </MobileExpandableCard>
                );
              })
            )}
          </div>
        </>
      )}
    </StudentManagementPage>
  );
}