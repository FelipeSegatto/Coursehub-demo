import { useCallback, useEffect, useMemo, useState } from "react";
import { Power, Trash2 } from "lucide-react";
import { apiFetch } from "../../services/APIService";
import { createAdminActivityService } from "../../services/AdminActivityService";
import { listClasses } from "../../services/AdminClassService";

import ManagementPageShell from "../ui/ManagementPageShell";
import ActivityModal from "../teachers/ActivityModal";
import AdminTable from "./AdminTable";
import StatusBadge from "../ui/StatusBadge";
import TableActionButton from "../ui/actions/TableActionButton";
import RowActionsMenu from "../ui/actions/RowActionsMenu";
import HoldToConfirmButton from "../ui/actions/HoldToConfirmButton";
import MobileFilterToggle from "../ui/MobileFilterToggle";
import MobileExpandableCard from "../ui/MobileExpandableCard";
import { formatDisplayDate } from "../../utils/dateUtils";

const TYPE_OPTIONS = [
  { value: "mixed", label: "Mista" },
  { value: "quiz", label: "Somente múltipla escolha" },
  { value: "text", label: "Somente discursiva" },
  { value: "upload", label: "Somente envio de arquivo" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Ativas" },
  { value: "inactive", label: "Inativas" },
  { value: "draft", label: "Rascunhos" },
  { value: "archived", label: "Arquivadas" },
];

const SCOPE_OPTIONS = [
  { value: "general", label: "Geral" },
  { value: "class_specific", label: "Específica por turma" },
];

const PAGE_LIMIT = 10;

function formatShortDateTime(value) {
  if (!value) return "-";

  return `${formatDisplayDate(String(value).slice(0, 10), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })} ${String(value).slice(11, 16)}`;
}

/**
 * Shell compartilhado entre ActivitiesAdmin (activityKind="activity")
 * e AssessmentsAdmin (activityKind="exam") — backend, filtros,
 * tabela, modal de impacto e o próprio ActivityModal (adaptado com
 * `endpoints`) são idênticos; só o vocabulário na tela muda.
 */
export default function AdminActivitiesPage({ activityKind }) {
  const isExam = activityKind === "exam";
  const resourcePath = isExam ? "assessments" : "activities";
  const singular = isExam ? "avaliação" : "atividade";
  const singularCapitalized = isExam ? "Avaliação" : "Atividade";

  const service = useMemo(() => createAdminActivityService(resourcePath), [resourcePath]);

  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_LIMIT,
    total: 0,
    totalPages: 1,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [courseId, setCourseId] = useState("");
  const [classId, setClassId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [scope, setScope] = useState("");
  const [page, setPage] = useState(1);

  const [courses, setCourses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [filterClasses, setFilterClasses] = useState([]);
  const [modalClasses, setModalClasses] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [selectedItem, setSelectedItem] = useState(null);

  const [impactTarget, setImpactTarget] = useState(null);
  const [impactData, setImpactData] = useState(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [searchInput]);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const result = await service.list({
        search,
        courseId,
        classId,
        teacherId,
        type,
        status,
        scope,
        page,
        limit: PAGE_LIMIT,
      });

      setItems(Array.isArray(result?.data) ? result.data : []);
      setSummary(result?.summary || null);
      setPagination(
        result?.pagination || { page: 1, limit: PAGE_LIMIT, total: 0, totalPages: 1 }
      );
    } catch (requestError) {
      console.error(`[AdminActivitiesPage:${resourcePath}] erro:`, requestError);
      setError(requestError.message || `Não foi possível carregar as ${resourcePath}.`);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [service, resourcePath, search, courseId, classId, teacherId, type, status, scope, page]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    let ignoreRequest = false;

    async function loadBaseOptions() {
      try {
        const [coursesResponse, teachersResponse, classesResponse] = await Promise.all([
          apiFetch("/api/admin/courses"),
          apiFetch("/api/admin/teachers"),
          listClasses({ limit: 100 }),
        ]);

        if (ignoreRequest) return;

        setCourses(Array.isArray(coursesResponse) ? coursesResponse : []);
        setTeachers(Array.isArray(teachersResponse) ? teachersResponse : []);
        setModalClasses(Array.isArray(classesResponse?.data) ? classesResponse.data : []);
      } catch (requestError) {
        if (!ignoreRequest) console.error("Erro ao carregar filtros base:", requestError);
      }
    }

    loadBaseOptions();

    return () => {
      ignoreRequest = true;
    };
  }, []);

  useEffect(() => {
    if (!courseId) {
      setFilterClasses([]);
      setClassId("");
      return;
    }

    let ignoreRequest = false;

    async function loadClassesForFilter() {
      try {
        const response = await listClasses({ courseId, limit: 100 });

        if (!ignoreRequest) {
          setFilterClasses(Array.isArray(response?.data) ? response.data : []);
        }
      } catch (requestError) {
        if (!ignoreRequest) console.error("Erro ao carregar turmas do curso:", requestError);
      }
    }

    loadClassesForFilter();

    return () => {
      ignoreRequest = true;
    };
  }, [courseId]);

  function handleCreateClick() {
    setModalMode("create");
    setSelectedItem(null);
    setModalOpen(true);
  }

  function handleEditClick(item) {
    setModalMode("edit");
    setSelectedItem(item);
    setModalOpen(true);
  }

  async function handleModalSuccess() {
    setModalOpen(false);
    setSelectedItem(null);
    await fetchItems();
  }

  async function handleStatusChange(item, nextStatus) {
    try {
      setActionLoading(true);
      setActionError("");

      await service.updateStatus(item.id, nextStatus);
      await fetchItems();
    } catch (requestError) {
      console.error("Erro ao alterar status:", requestError);
      setActionError(requestError.message || "Erro ao alterar status.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRemoveClick(item) {
    setImpactTarget(item);
    setImpactData(null);
    setActionError("");
    setImpactLoading(true);

    try {
      const impact = await service.getImpact(item.id);
      setImpactData(impact);
    } catch (requestError) {
      console.error("Erro ao calcular impacto:", requestError);
      setActionError(requestError.message || "Não foi possível calcular o impacto.");
    } finally {
      setImpactLoading(false);
    }
  }

  function closeImpactModal() {
    if (actionLoading) return;

    setImpactTarget(null);
    setImpactData(null);
    setActionError("");
  }

  const hasImpact =
    impactData && (impactData.totalSubmissions > 0 || impactData.totalGrades > 0);

  async function handleConfirmDelete() {
    if (!impactTarget) return;

    try {
      setActionLoading(true);
      setActionError("");

      await service.remove(impactTarget.id);

      closeImpactModal();
      await fetchItems();
    } catch (requestError) {
      console.error("Erro ao remover:", requestError);
      setActionError(requestError.message || "Erro ao remover.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleArchiveInstead() {
    if (!impactTarget) return;

    try {
      setActionLoading(true);
      setActionError("");

      await service.updateStatus(impactTarget.id, "archived");

      closeImpactModal();
      await fetchItems();
    } catch (requestError) {
      console.error("Erro ao arquivar:", requestError);
      setActionError(requestError.message || "Erro ao arquivar.");
    } finally {
      setActionLoading(false);
    }
  }

  const stats = isExam
    ? [
        { title: "Total de avaliações", value: summary?.total ?? 0 },
        { title: "Ativas", value: summary?.active ?? 0, color: "green" },
        { title: "Próximas do prazo", value: summary?.dueSoon ?? 0, color: "yellow" },
        { title: "Encerradas", value: summary?.closed ?? 0, color: "red" },
        { title: "Pendentes de correção", value: summary?.pendingReviews ?? 0, color: "purple" },
        { title: "Corrigidas", value: summary?.graded ?? 0 },
      ]
    : [
        { title: "Total de atividades", value: summary?.total ?? 0 },
        { title: "Ativas", value: summary?.active ?? 0, color: "green" },
        { title: "Próximas do prazo", value: summary?.dueSoon ?? 0, color: "yellow" },
        { title: "Gerais", value: summary?.general ?? 0 },
        { title: "Específicas por turma", value: summary?.classSpecific ?? 0, color: "purple" },
        { title: "Submissões pendentes", value: summary?.pendingReviews ?? 0, color: "red" },
      ];

  const columns = [
    { key: "title", label: "Título" },
    { key: "course", label: "Curso" },
    { key: "scope", label: "Turma" },
    { key: "teacher", label: "Professor" },
    { key: "type", label: "Tipo" },
    { key: "due_date", label: "Prazo" },
    { key: "max_score", label: "Nota máx.", align: "right" },
    { key: "submissions", label: "Envios", align: "right" },
    { key: "pending", label: "Pendentes", align: "right" },
    { key: "status", label: "Status" },
    { key: "actions", label: "Ações", align: "right" },
  ];

  const inputClass =
    "w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-xs text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:w-48 truncate";

  const activeFilterCount = [courseId, classId, teacherId, type, scope, status].filter(
    Boolean
  ).length;

  return (
    <>
      <ManagementPageShell
        backTo="/admin/dashboard-admin"
        title={isExam ? "Gerenciamento de avaliações" : "Gerenciamento de atividades"}
        description={
          isExam
            ? "Provas e avaliações de todos os cursos e turmas, com acompanhamento de correções."
            : "Atividades de todos os cursos e turmas, com acompanhamento de envios e correções."
        }
        createButtonText={isExam ? "+ Nova avaliação" : "+ Nova atividade"}
        onCreateClick={handleCreateClick}
        stats={stats}
        tableTitle={isExam ? "Lista de avaliações" : "Lista de atividades"}
        tableActions={
          <MobileFilterToggle activeCount={activeFilterCount}>
            <select
              value={courseId}
              onChange={(event) => {
                setCourseId(event.target.value);
                setPage(1);
              }}
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
              value={classId}
              onChange={(event) => {
                setClassId(event.target.value);
                setPage(1);
              }}
              disabled={!courseId}
              className={inputClass}
            >
              <option value="">Todas as turmas</option>
              {filterClasses.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name}
                </option>
              ))}
            </select>

            <select
              value={teacherId}
              onChange={(event) => {
                setTeacherId(event.target.value);
                setPage(1);
              }}
              className={inputClass}
            >
              <option value="">Todos os professores</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </option>
              ))}
            </select>

            <select
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                setPage(1);
              }}
              className={inputClass}
            >
              <option value="">Todos os tipos</option>
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              value={scope}
              onChange={(event) => {
                setScope(event.target.value);
                setPage(1);
              }}
              className={inputClass}
            >
              <option value="">Geral e específica</option>
              {SCOPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className={inputClass}
            >
              <option value="">Todos os status</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </MobileFilterToggle>
        }
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder={`Buscar ${isExam ? "avaliação" : "atividade"} ou curso...`}
      >
        {actionError && (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {actionError}
          </p>
        )}

        {loading && (
          <p className="py-6 text-center text-gray-500">
            Carregando {isExam ? "avaliações" : "atividades"}...
          </p>
        )}

        {!loading && error && (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>

            <button
              type="button"
              onClick={fetchItems}
              className="text-sm font-semibold text-red-700 hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            <AdminTable
              columns={columns}
              data={items}
              emptyMessage={`Nenhuma ${isExam ? "avaliação" : "atividade"} encontrada.`}
              renderRow={(item) => (
                <tr key={item.id} className="border-b border-gray-100">
                  <td className="px-3 py-3">
                    <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                  </td>

                  <td className="px-3 py-3 text-sm text-gray-600">{item.course?.name || "-"}</td>
                  <td className="px-3 py-3 text-sm text-gray-600">{item.scopeLabel}</td>
                  <td className="px-3 py-3 text-sm text-gray-600">{item.teacher?.name || "-"}</td>

                  <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">
                    {TYPE_OPTIONS.find((option) => option.value === item.type)?.label ||
                      item.type}
                  </td>

                  <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">{formatShortDateTime(item.dueDate)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-gray-600">{item.maxScore}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-gray-600">{item.submissionCounts.total}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-gray-600">{item.submissionCounts.pendingReview}</td>

                  <td className="whitespace-nowrap px-3 py-3">
                    <StatusBadge status={item.status} />
                  </td>

                  <td className="whitespace-nowrap px-3 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <TableActionButton variant="accent" size="sm" onClick={() => handleEditClick(item)}>
                        Editar
                      </TableActionButton>

                      <RowActionsMenu
                        items={[
                          {
                            key: "toggle-status",
                            label: item.status === "active" ? "Inativar" : "Ativar",
                            icon: Power,
                            variant: "warning",
                            disabled: actionLoading,
                            onClick: () =>
                              handleStatusChange(item, item.status === "active" ? "inactive" : "active"),
                          },
                          {
                            key: "remove",
                            label: "Remover",
                            icon: Trash2,
                            variant: "danger",
                            separator: true,
                            disabled: actionLoading,
                            onClick: () => handleRemoveClick(item),
                          },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              )}
              renderMobileCard={(item) => (
                <MobileExpandableCard
                  key={item.id}
                  title={item.title}
                  subtitle={item.course?.name}
                  badge={<StatusBadge status={item.status} size="sm" />}
                  primaryAction={
                    <div className="flex items-center gap-2">
                      <TableActionButton
                        variant="accent"
                        size="md"
                        className="flex-1"
                        onClick={() => handleEditClick(item)}
                      >
                        Editar
                      </TableActionButton>

                      <RowActionsMenu
                        items={[
                          {
                            key: "toggle-status",
                            label: item.status === "active" ? "Inativar" : "Ativar",
                            icon: Power,
                            variant: "warning",
                            disabled: actionLoading,
                            onClick: () =>
                              handleStatusChange(item, item.status === "active" ? "inactive" : "active"),
                          },
                          {
                            key: "remove",
                            label: "Remover",
                            icon: Trash2,
                            variant: "danger",
                            separator: true,
                            disabled: actionLoading,
                            onClick: () => handleRemoveClick(item),
                          },
                        ]}
                      />
                    </div>
                  }
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Turma</span>
                    <span className="font-medium text-gray-900">{item.scopeLabel}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Professor</span>
                    <span className="font-medium text-gray-900">{item.teacher?.name || "-"}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Tipo</span>
                    <span className="font-medium text-gray-900">
                      {TYPE_OPTIONS.find((option) => option.value === item.type)?.label ||
                        item.type}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Prazo</span>
                    <span className="font-medium text-gray-900">
                      {formatShortDateTime(item.dueDate)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Nota máx.</span>
                    <span className="font-medium text-gray-900">{item.maxScore}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Envios</span>
                    <span className="font-medium text-gray-900">
                      {item.submissionCounts.total}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Pendentes</span>
                    <span className="font-medium text-gray-900">
                      {item.submissionCounts.pendingReview}
                    </span>
                  </div>
                </MobileExpandableCard>
              )}
            />

            {pagination.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between gap-4">
                <p className="text-sm text-gray-500">
                  Página {pagination.page} de {pagination.totalPages} · {pagination.total}{" "}
                  registro(s)
                </p>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(current - 1, 1))}
                    disabled={pagination.page <= 1}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Anterior
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setPage((current) => Math.min(current + 1, pagination.totalPages))
                    }
                    disabled={pagination.page >= pagination.totalPages}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </ManagementPageShell>

      {modalOpen && (
        <ActivityModal
          mode={modalMode}
          activity={selectedItem}
          courses={courses}
          classes={modalClasses}
          activityKind={activityKind}
          endpoints={{
            fetchDetail: (id) => `/api/admin/${resourcePath}/${id}`,
            create: () => `/api/admin/${resourcePath}`,
            update: (id) => `/api/admin/${resourcePath}/${id}`,
          }}
          handleCloseModal={() => setModalOpen(false)}
          onSuccess={handleModalSuccess}
        />
      )}

      {impactTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-gray-900">
              Remover {singular}
            </h2>

            <p className="mt-3 rounded-xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-800">
              {impactTarget.title}
            </p>

            {impactLoading && (
              <p className="mt-4 text-sm text-gray-500">Calculando impacto...</p>
            )}

            {actionError && (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {actionError}
              </p>
            )}

            {!impactLoading && impactData && (
              <>
                {hasImpact ? (
                  <>
                    <p className="mt-4 text-sm text-red-600">
                      {singularCapitalized} já possui envios ou notas e não pode ser
                      removida permanentemente:
                    </p>

                    <ul className="mt-3 space-y-1 text-sm text-gray-700">
                      <li>Envios: {impactData.totalSubmissions}</li>
                      <li>Notas: {impactData.totalGrades}</li>
                    </ul>

                    <p className="mt-4 text-sm text-gray-600">
                      Você pode arquivar em vez de excluir — o histórico é preservado.
                    </p>
                  </>
                ) : (
                  <p className="mt-4 text-sm text-gray-600">
                    Não há envios nem notas — pode ser removida permanentemente.
                  </p>
                )}
              </>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeImpactModal}
                disabled={actionLoading}
                className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-60"
              >
                Cancelar
              </button>

              {!impactLoading && impactData && hasImpact && (
                <button
                  type="button"
                  onClick={handleArchiveInstead}
                  disabled={actionLoading}
                  className="rounded-xl bg-yellow-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-yellow-600 disabled:opacity-60"
                >
                  {actionLoading ? "Arquivando..." : "Arquivar"}
                </button>
              )}

              {!impactLoading && impactData && !hasImpact && (
                <HoldToConfirmButton
                  variant="danger"
                  holdDuration={1500}
                  onConfirm={handleConfirmDelete}
                  disabled={actionLoading}
                  loading={actionLoading}
                  icon={Trash2}
                >
                  Remover permanentemente
                </HoldToConfirmButton>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
