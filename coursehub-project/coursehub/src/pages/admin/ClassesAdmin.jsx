import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Eye,
  Pencil,
  Trash2,
  X,
} from "lucide-react";

import { apiFetch } from "../../services/APIService";

import {
  listClasses,
  getClassImpact,
  updateClassStatus,
  deleteClass,
} from "../../services/AdminClassService";

import ManagementPageShell from "../../components/ui/ManagementPageShell";
import AdminClassModal from "../../components/admin/AdminClassModal";
import AdminTable from "../../components/admin/AdminTable";
import StatusBadge from "../../components/ui/StatusBadge";

import TableActionButton from "../../components/ui/actions/TableActionButton";
import RowActionsMenu from "../../components/ui/actions/RowActionsMenu";
import HoldToConfirmButton from "../../components/ui/actions/HoldToConfirmButton";
import MobileFilterToggle from "../../components/ui/MobileFilterToggle";
import MobileExpandableCard from "../../components/ui/MobileExpandableCard";

import { formatDisplayDate } from "../../utils/dateUtils";

const STATUS_OPTIONS = [
  {
    value: "active",
    label: "Ativas",
  },
  {
    value: "inactive",
    label: "Inativas",
  },
  {
    value: "finished",
    label: "Finalizadas",
  },
];

const SHIFT_OPTIONS = [
  {
    value: "morning",
    label: "Manhã",
  },
  {
    value: "afternoon",
    label: "Tarde",
  },
  {
    value: "night",
    label: "Noite",
  },
  {
    value: "online",
    label: "Online",
  },
];

const PAGE_LIMIT = 10;

function formatShortDate(value) {
  if (!value) return "-";

  return formatDisplayDate(
    String(value).slice(0, 10),
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }
  );
}

function getShiftLabel(value) {
  return (
    SHIFT_OPTIONS.find(
      (option) => option.value === value
    )?.label ||
    value ||
    "-"
  );
}

export default function ClassesAdmin() {
  const [classes, setClasses] = useState([]);
  const [summary, setSummary] = useState(null);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_LIMIT,
    total: 0,
    totalPages: 1,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /*
   * Filtros
   */
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [searchParams, setSearchParams] = useSearchParams();

  const [courseId, setCourseId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [shift, setShift] = useState("");

  // Ex.: deep link do dashboard (/admin/turmas?status=active) --
  // mantém a URL sincronizada para sobreviver a um refresh.
  useEffect(() => {
    setSearchParams(status ? { status } : {}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const [page, setPage] = useState(1);

  const [courses, setCourses] = useState([]);
  const [teachers, setTeachers] = useState([]);

  /*
   * Create / Edit
   */
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [selectedClass, setSelectedClass] =
    useState(null);

  /*
   * Visualização
   */
  const [viewTarget, setViewTarget] =
    useState(null);

  /*
   * Remoção / impacto
   */
  const [impactTarget, setImpactTarget] =
    useState(null);

  const [impactData, setImpactData] =
    useState(null);

  const [impactLoading, setImpactLoading] =
    useState(false);

  const [actionLoading, setActionLoading] =
    useState(false);

  const [actionError, setActionError] =
    useState("");

  /*
   * Debounce da busca.
   *
   * A listagem é paginada pelo backend,
   * então não queremos enviar uma request
   * a cada tecla digitada.
   */
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchInput]);

  /*
   * Lista turmas.
   */
  const fetchClasses = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const result = await listClasses({
        search,
        courseId,
        teacherId,
        status,
        shift,
        page,
        limit: PAGE_LIMIT,
      });

      setClasses(
        Array.isArray(result?.data)
          ? result.data
          : []
      );

      setSummary(result?.summary || null);

      setPagination(
        result?.pagination || {
          page: 1,
          limit: PAGE_LIMIT,
          total: 0,
          totalPages: 1,
        }
      );
    } catch (requestError) {
      console.error(
        "[ClassesAdmin] erro ao buscar turmas:",
        requestError
      );

      setError(
        requestError.message ||
          "Não foi possível carregar as turmas."
      );

      setClasses([]);
    } finally {
      setLoading(false);
    }
  }, [
    search,
    courseId,
    teacherId,
    status,
    shift,
    page,
  ]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  /*
   * Opções dos filtros.
   */
  useEffect(() => {
    let ignoreRequest = false;

    async function loadFilterOptions() {
      try {
        const [
          coursesResponse,
          teachersResponse,
        ] = await Promise.all([
          apiFetch("/api/admin/courses"),
          apiFetch("/api/admin/teachers"),
        ]);

        if (ignoreRequest) return;

        setCourses(
          Array.isArray(coursesResponse)
            ? coursesResponse
            : []
        );

        setTeachers(
          Array.isArray(teachersResponse)
            ? teachersResponse
            : []
        );
      } catch (requestError) {
        if (!ignoreRequest) {
          console.error(
            "Erro ao carregar filtros:",
            requestError
          );
        }
      }
    }

    loadFilterOptions();

    return () => {
      ignoreRequest = true;
    };
  }, []);

  /*
   * CRUD
   */
  function handleCreateClick() {
    setModalMode("create");
    setSelectedClass(null);
    setModalOpen(true);
  }

  function handleEditClick(classItem) {
    setModalMode("edit");
    setSelectedClass(classItem);
    setModalOpen(true);
  }

  async function handleModalSuccess() {
    setModalOpen(false);
    setSelectedClass(null);

    await fetchClasses();
  }

  /*
   * Visualização
   */
  function handleViewClick(classItem) {
    setViewTarget(classItem);
  }

  function closeViewModal() {
    setViewTarget(null);
  }

  /*
   * Remoção
   *
   * O clique em "Remover" NÃO executa exclusão.
   * Primeiro buscamos o impacto.
   */
  async function handleRemoveClick(classItem) {
    setImpactTarget(classItem);
    setImpactData(null);
    setActionError("");
    setImpactLoading(true);

    try {
      const impact = await getClassImpact(
        classItem.id
      );

      setImpactData(impact);
    } catch (requestError) {
      console.error(
        "Erro ao calcular impacto da turma:",
        requestError
      );

      setActionError(
        requestError.message ||
          "Não foi possível calcular o impacto da turma."
      );
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

  /*
   * Mantemos a regra existente:
   *
   * possui vínculos
   * -> não pode excluir
   * -> pode inativar
   *
   * não possui vínculos
   * -> pode excluir permanentemente
   */
  const hasImpact =
    impactData &&
    Object.values(impactData).some(
      (count) => Number(count) > 0
    );

  async function handleConfirmDelete() {
    if (!impactTarget) return;

    try {
      setActionLoading(true);
      setActionError("");

      await deleteClass(impactTarget.id);

      /*
       * Não chamamos closeImpactModal()
       * aqui porque ela impede fechamento
       * enquanto actionLoading = true.
       */
      setImpactTarget(null);
      setImpactData(null);

      await fetchClasses();
    } catch (requestError) {
      console.error(
        "Erro ao remover turma:",
        requestError
      );

      setActionError(
        requestError.message ||
          "Erro ao remover turma."
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleInactivateInstead() {
    if (!impactTarget) return;

    try {
      setActionLoading(true);
      setActionError("");

      await updateClassStatus(
        impactTarget.id,
        "inactive"
      );

      /*
       * Mesmo motivo do delete:
       * fechamos diretamente depois do sucesso.
       */
      setImpactTarget(null);
      setImpactData(null);

      await fetchClasses();
    } catch (requestError) {
      console.error(
        "Erro ao inativar turma:",
        requestError
      );

      setActionError(
        requestError.message ||
          "Erro ao inativar turma."
      );
    } finally {
      setActionLoading(false);
    }
  }

  /*
   * Indicadores
   */
  const stats = [
    {
      title: "Total de turmas",
      value: summary?.total ?? 0,
    },
    {
      title: "Turmas ativas",
      value: summary?.active ?? 0,
    },
    {
      title: "Inativas/Finalizadas",
      value:
        summary?.inactiveOrFinished ?? 0,
    },
    {
      title: "Alunos matriculados",
      value:
        summary?.totalActiveEnrollments ?? 0,
    },
  ];

  /*
   * Colunas
   */
  const columns = [
    {
      key: "class",
      label: "Turma",
    },
    {
      key: "course",
      label: "Curso",
    },
    {
      key: "teacher",
      label: "Professor",
    },
    {
      key: "shift",
      label: "Turno",
    },
    {
      key: "start_date",
      label: "Início",
    },
    {
      key: "end_date",
      label: "Término",
    },
    {
      key: "active_enrollments",
      label: "Alunos ativos",
      align: "right",
    },
    {
      key: "session_count",
      label: "Sessões",
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

  const inputClass =
    "w-full truncate rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-xs text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:w-40";

  const activeFilterCount = [courseId, teacherId, shift, status].filter(Boolean).length;

  return (
    <>
      <ManagementPageShell
        backTo="/admin/dashboard-admin"
        title="Gerenciamento de turmas"
        description="Acompanhe turmas cadastradas, professores responsáveis e matrículas ativas."
        createButtonText="+ Nova turma"
        onCreateClick={handleCreateClick}
        stats={stats}
        tableTitle="Lista de turmas"
        tableActions={
          <MobileFilterToggle activeCount={activeFilterCount}>
            {/* CURSO */}
            <select
              value={courseId}
              onChange={(event) => {
                setCourseId(
                  event.target.value
                );

                setPage(1);
              }}
              className={inputClass}
            >
              <option value="">
                Todos os cursos
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

            {/* PROFESSOR */}
            <select
              value={teacherId}
              onChange={(event) => {
                setTeacherId(
                  event.target.value
                );

                setPage(1);
              }}
              className={inputClass}
            >
              <option value="">
                Todos os professores
              </option>

              {teachers.map((teacher) => (
                <option
                  key={teacher.id}
                  value={teacher.id}
                >
                  {teacher.name}
                </option>
              ))}
            </select>

            {/* TURNO */}
            <select
              value={shift}
              onChange={(event) => {
                setShift(event.target.value);
                setPage(1);
              }}
              className={inputClass}
            >
              <option value="">
                Todos os turnos
              </option>

              {SHIFT_OPTIONS.map(
                (option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                )
              )}
            </select>

            {/* STATUS */}
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className={inputClass}
            >
              <option value="">
                Todos os status
              </option>

              {STATUS_OPTIONS.map(
                (option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                )
              )}
            </select>
          </MobileFilterToggle>
        }
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder="Buscar turma, curso ou professor..."
      >
        {/* LOADING */}
        {loading && (
          <p className="py-6 text-center text-gray-500">
            Carregando turmas...
          </p>
        )}

        {/* ERROR */}
        {!loading && error && (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">
              {error}
            </p>

            <button
              type="button"
              onClick={fetchClasses}
              className="text-sm font-semibold text-red-700 hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {/* TABLE */}
        {!loading && !error && (
          <>
            <AdminTable
              columns={columns}
              data={classes}
              emptyMessage="Nenhuma turma encontrada."
              renderRow={(classItem) => (
                <tr
                  key={classItem.id}
                  className="border-b border-gray-100"
                >
                  {/* TURMA */}
                  <td className="px-3 py-3">
                    <p className="text-sm font-semibold text-gray-900">
                      {classItem.name}
                    </p>
                  </td>

                  {/* CURSO */}
                  <td className="px-3 py-3 text-sm text-gray-600">
                    {classItem.course?.name ||
                      "-"}
                  </td>

                  {/* PROFESSOR */}
                  <td className="px-3 py-3 text-sm text-gray-600">
                    {classItem.teacher?.name ||
                      "-"}
                  </td>

                  {/* TURNO */}
                  <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">
                    {getShiftLabel(
                      classItem.shift
                    )}
                  </td>

                  {/* INÍCIO */}
                  <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">
                    {formatShortDate(
                      classItem.startDate
                    )}
                  </td>

                  {/* FIM */}
                  <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">
                    {formatShortDate(
                      classItem.endDate
                    )}
                  </td>

                  {/* MATRÍCULAS */}
                  <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-gray-600">
                    {classItem.activeEnrollments}
                  </td>

                  {/* SESSÕES */}
                  <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-gray-600">
                    {classItem.sessionCount}
                  </td>

                  {/* STATUS */}
                  <td className="whitespace-nowrap px-3 py-3">
                    <StatusBadge
                      status={classItem.status}
                    />
                  </td>

                  {/* AÇÕES */}
                  <td className="whitespace-nowrap px-3 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <TableActionButton
                        variant="accent"
                        size="sm"
                        icon={Eye}
                        onClick={() =>
                          handleViewClick(
                            classItem
                          )
                        }
                      >
                        Ver
                      </TableActionButton>

                      <RowActionsMenu
                        items={[
                          {
                            key: "edit",
                            label: "Editar",
                            icon: Pencil,
                            variant:
                              "neutral",
                            onClick: () =>
                              handleEditClick(
                                classItem
                              ),
                          },

                          {
                            key: "delete",
                            label: "Remover",
                            icon: Trash2,
                            variant: "danger",

                            /*
                             * Sem hold.
                             *
                             * Essa ação só abre
                             * o modal de impacto.
                             */
                            separator: true,

                            onClick: () =>
                              handleRemoveClick(
                                classItem
                              ),
                          },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              )}
              renderMobileCard={(classItem) => (
                <MobileExpandableCard
                  key={classItem.id}
                  title={classItem.name}
                  subtitle={classItem.course?.name || "-"}
                  badge={<StatusBadge status={classItem.status} size="sm" />}
                  primaryAction={
                    <div className="flex items-center gap-2">
                      <TableActionButton
                        variant="accent"
                        size="md"
                        icon={Eye}
                        className="flex-1"
                        onClick={() => handleViewClick(classItem)}
                      >
                        Ver
                      </TableActionButton>

                      <RowActionsMenu
                        items={[
                          {
                            key: "edit",
                            label: "Editar",
                            icon: Pencil,
                            variant: "neutral",
                            onClick: () => handleEditClick(classItem),
                          },
                          {
                            key: "delete",
                            label: "Remover",
                            icon: Trash2,
                            variant: "danger",
                            separator: true,
                            onClick: () => handleRemoveClick(classItem),
                          },
                        ]}
                      />
                    </div>
                  }
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Professor</span>
                    <span className="font-medium text-gray-900">{classItem.teacher?.name || "-"}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Turno</span>
                    <span className="font-medium text-gray-900">{getShiftLabel(classItem.shift)}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Início</span>
                    <span className="font-medium text-gray-900">{formatShortDate(classItem.startDate)}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Término</span>
                    <span className="font-medium text-gray-900">{formatShortDate(classItem.endDate)}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Alunos ativos</span>
                    <span className="font-medium text-gray-900">{classItem.activeEnrollments}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Sessões</span>
                    <span className="font-medium text-gray-900">{classItem.sessionCount}</span>
                  </div>
                </MobileExpandableCard>
              )}
            />

            {/* PAGINAÇÃO */}
            {pagination.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between gap-4">
                <p className="text-sm text-gray-500">
                  Página {pagination.page} de{" "}
                  {pagination.totalPages} ·{" "}
                  {pagination.total} turma(s)
                </p>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setPage((current) =>
                        Math.max(
                          current - 1,
                          1
                        )
                      )
                    }
                    disabled={
                      pagination.page <= 1
                    }
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Anterior
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setPage((current) =>
                        Math.min(
                          current + 1,
                          pagination.totalPages
                        )
                      )
                    }
                    disabled={
                      pagination.page >=
                      pagination.totalPages
                    }
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </ManagementPageShell>

      {/* =========================================================
          CREATE / EDIT MODAL
      ========================================================= */}

      {modalOpen && (
        <AdminClassModal
          mode={modalMode}
          initialData={selectedClass}
          handleCloseModal={() =>
            setModalOpen(false)
          }
          onSuccess={handleModalSuccess}
        />
      )}

      {/* =========================================================
          VIEW MODAL
      ========================================================= */}

      {viewTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeViewModal();
            }
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
            {/* HEADER */}
            <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">
                  Turma
                </p>

                <h2 className="mt-1 truncate text-xl font-bold text-gray-900">
                  {viewTarget.name}
                </h2>
              </div>

              <button
                type="button"
                onClick={closeViewModal}
                aria-label="Fechar"
                title="Fechar"
                className="ml-4 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <X
                  size={17}
                  aria-hidden="true"
                />
              </button>
            </div>

            {/* CONTENT */}
            <div className="px-6 py-6">
              <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                {/* COURSE */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">
                    Curso
                  </p>

                  <p className="mt-1.5 text-sm font-semibold text-gray-800">
                    {viewTarget.course
                      ?.name || "-"}
                  </p>
                </div>

                {/* TEACHER */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">
                    Professor
                  </p>

                  <p className="mt-1.5 text-sm font-semibold text-gray-800">
                    {viewTarget.teacher
                      ?.name || "-"}
                  </p>
                </div>

                {/* SHIFT */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">
                    Turno
                  </p>

                  <p className="mt-1.5 text-sm font-semibold text-gray-800">
                    {getShiftLabel(
                      viewTarget.shift
                    )}
                  </p>
                </div>

                {/* STATUS */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">
                    Status
                  </p>

                  <div className="mt-1.5">
                    <StatusBadge
                      status={
                        viewTarget.status
                      }
                    />
                  </div>
                </div>

                {/* START */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">
                    Data de início
                  </p>

                  <p className="mt-1.5 text-sm font-semibold text-gray-800">
                    {formatShortDate(
                      viewTarget.startDate
                    )}
                  </p>
                </div>

                {/* END */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">
                    Data de término
                  </p>

                  <p className="mt-1.5 text-sm font-semibold text-gray-800">
                    {formatShortDate(
                      viewTarget.endDate
                    )}
                  </p>
                </div>
              </div>

              {/* SUMMARY */}
              <div className="mt-6 grid grid-cols-2 gap-3 border-t border-gray-100 pt-5">
                <div className="rounded-xl bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium text-gray-500">
                    Alunos ativos
                  </p>

                  <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">
                    {viewTarget.activeEnrollments ??
                      0}
                  </p>
                </div>

                <div className="rounded-xl bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium text-gray-500">
                    Sessões
                  </p>

                  <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">
                    {viewTarget.sessionCount ??
                      0}
                  </p>
                </div>
              </div>
            </div>

            {/* FOOTER */}
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/50 px-6 py-4">
              <TableActionButton
                variant="neutral"
                size="sm"
                onClick={closeViewModal}
              >
                Fechar
              </TableActionButton>

              <TableActionButton
                variant="accent"
                size="sm"
                icon={Pencil}
                onClick={() => {
                  const currentClass =
                    viewTarget;

                  closeViewModal();

                  handleEditClick(
                    currentClass
                  );
                }}
              >
                Editar turma
              </TableActionButton>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          REMOVE / IMPACT MODAL
      ========================================================= */}

      {impactTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeImpactModal();
            }
          }}
        >
          <div className="w-full max-w-[420px] rounded-2xl bg-white p-5 shadow-2xl">
            {/* HEADER */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-red-500">
                  Ação sensível
                </p>

                <h2 className="mt-1 text-lg font-bold text-gray-900">
                  Remover turma
                </h2>
              </div>

              <button
                type="button"
                onClick={closeImpactModal}
                disabled={actionLoading}
                aria-label="Fechar"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
              >
                <X
                  size={17}
                  aria-hidden="true"
                />
              </button>
            </div>

            {/* NAME */}
            <p className="mt-4 rounded-lg bg-gray-50 px-3.5 py-2.5 text-sm font-semibold text-gray-800">
              {impactTarget.name}
            </p>

            {/* LOADING IMPACT */}
            {impactLoading && (
              <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
                <span
                  aria-hidden="true"
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600"
                />

                Calculando impacto...
              </div>
            )}

            {/* ERROR */}
            {actionError && (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-xs leading-5 text-red-700">
                {actionError}
              </p>
            )}

            {/* IMPACT */}
            {!impactLoading &&
              impactData && (
                <>
                  {hasImpact ? (
                    <>
                      <p className="mt-4 text-sm leading-6 text-red-600">
                        Esta turma possui
                        vínculos ativos e não
                        pode ser removida
                        permanentemente.
                      </p>

                      <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                        <dl className="space-y-2 text-xs">
                          <div className="flex items-center justify-between gap-4">
                            <dt className="text-gray-500">
                              Matrículas ativas
                            </dt>

                            <dd className="font-semibold tabular-nums text-gray-800">
                              {
                                impactData.activeEnrollments
                              }
                            </dd>
                          </div>

                          <div className="flex items-center justify-between gap-4">
                            <dt className="text-gray-500">
                              Atividades
                              específicas
                            </dt>

                            <dd className="font-semibold tabular-nums text-gray-800">
                              {
                                impactData.activities
                              }
                            </dd>
                          </div>

                          <div className="flex items-center justify-between gap-4">
                            <dt className="text-gray-500">
                              Conteúdos
                              específicos
                            </dt>

                            <dd className="font-semibold tabular-nums text-gray-800">
                              {
                                impactData.courseContents
                              }
                            </dd>
                          </div>

                          <div className="flex items-center justify-between gap-4">
                            <dt className="text-gray-500">
                              Sessões
                            </dt>

                            <dd className="font-semibold tabular-nums text-gray-800">
                              {
                                impactData.sessions
                              }
                            </dd>
                          </div>

                          <div className="flex items-center justify-between gap-4">
                            <dt className="text-gray-500">
                              Frequências
                            </dt>

                            <dd className="font-semibold tabular-nums text-gray-800">
                              {
                                impactData.attendanceRecords
                              }
                            </dd>
                          </div>
                        </dl>
                      </div>

                      <p className="mt-4 text-xs leading-5 text-gray-500">
                        A turma pode ser
                        inativada sem perder
                        seu histórico.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mt-4 text-sm leading-6 text-gray-600">
                        Esta turma não possui
                        vínculos registrados e
                        pode ser removida
                        permanentemente.
                      </p>

                      <p className="mt-2 text-xs leading-5 text-gray-500">
                        A exclusão remove o
                        registro da turma. Para
                        evitar uma ação
                        acidental, mantenha o
                        botão pressionado para
                        confirmar.
                      </p>
                    </>
                  )}
                </>
              )}

            {/* FOOTER */}
              <div className="mt-5 flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={closeImpactModal}
                  disabled={actionLoading}
                  className="
                    inline-flex
                    h-9
                    items-center
                    justify-center
                    rounded-lg
                    border
                    border-gray-300
                    bg-white
                    px-4
                    text-xs
                    font-semibold
                    text-gray-700
                    transition
                    hover:bg-gray-50
                    focus:outline-none
                    focus-visible:ring-2
                    focus-visible:ring-blue-500
                    focus-visible:ring-offset-1
                    disabled:cursor-not-allowed
                    disabled:opacity-50
                  "
                >
                  Cancelar
                </button>

                {/* COM VÍNCULOS → INATIVAR */}
                {!impactLoading && impactData && hasImpact && (
                  <HoldToConfirmButton
                    variant="warning"
                    holdDuration={1200}
                    onConfirm={handleInactivateInstead}
                    disabled={actionLoading}
                    loading={actionLoading}
                  >
                    Inativar turma
                  </HoldToConfirmButton>
                )}

                {/* SEM VÍNCULOS → REMOVER */}
                {!impactLoading && impactData && !hasImpact && (
                  <HoldToConfirmButton
                    variant="danger"
                    holdDuration={1500}
                    onConfirm={handleConfirmDelete}
                    disabled={actionLoading}
                    loading={actionLoading}
                    icon={Trash2}
                  >
                    Remover
                  </HoldToConfirmButton>
                )}
              </div>
          </div>
        </div>
      )}
    </>
  );
}