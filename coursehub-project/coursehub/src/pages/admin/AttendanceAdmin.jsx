import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../services/APIService";
import { AdminAttendanceService } from "../../services/AdminAttendanceService";
import { listClasses } from "../../services/AdminClassService";
import { useAppliedFilters } from "../../hooks/useAppliedFilters";

import ManagementPageShell from "../../components/ui/ManagementPageShell";
import ExportPdfButton from "../../components/reports/ExportPdfButton";
import AdminTable from "../../components/admin/AdminTable";
import TableActionButton from "../../components/ui/actions/TableActionButton";
import MobileFilterToggle from "../../components/ui/MobileFilterToggle";
import MobileExpandableCard from "../../components/ui/MobileExpandableCard";
import { formatDisplayDate } from "../../utils/dateUtils";

const PAGE_LIMIT = 10;

const INITIAL_DRAFT = { courseId: "", classId: "", from: "", to: "" };

function hasValidScope(draft) {
  return Boolean(draft.classId);
}

function formatShortDate(value) {
  if (!value) return "-";

  return formatDisplayDate(String(value).slice(0, 10), { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Frequência por chamada: cada linha é um encontro que já teve
 * chamada lançada, não um registro individual aluno x encontro (essa
 * granularidade agora vive só no detalhe, /admin/frequencia/encontros/:id).
 * Turma é obrigatória para consultar -- curso só ajuda a filtrar as
 * opções de turma.
 */
export default function AttendanceAdmin() {
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_LIMIT, total: 0, totalPages: 1 });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { draft, updateDraft, applied, hasApplied, isStale, apply, clear, page, setPage } =
    useAppliedFilters(INITIAL_DRAFT);

  const [courses, setCourses] = useState([]);
  const [filterClasses, setFilterClasses] = useState([]);

  useEffect(() => {
    if (!applied) return;

    let ignoreRequest = false;

    async function fetchSessions() {
      try {
        setLoading(true);
        setError("");

        const result = await AdminAttendanceService.listSessions({
          classId: applied.classId,
          from: applied.from,
          to: applied.to,
          page,
          limit: PAGE_LIMIT,
        });

        if (ignoreRequest) return;

        setItems(Array.isArray(result?.data) ? result.data : []);
        setPagination(result?.pagination || { page: 1, limit: PAGE_LIMIT, total: 0, totalPages: 1 });
      } catch (requestError) {
        if (ignoreRequest) return;

        console.error("[AttendanceAdmin] erro:", requestError);
        setError(requestError.message || "Não foi possível carregar as chamadas de frequência.");
        setItems([]);
      } finally {
        if (!ignoreRequest) setLoading(false);
      }
    }

    fetchSessions();

    return () => {
      ignoreRequest = true;
    };
  }, [applied, page]);

  useEffect(() => {
    let ignoreRequest = false;

    async function loadCourses() {
      try {
        const coursesResponse = await apiFetch("/api/admin/courses");

        if (!ignoreRequest) setCourses(Array.isArray(coursesResponse) ? coursesResponse : []);
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

  const columns = [
    { key: "session", label: "Encontro" },
    { key: "date", label: "Data" },
    { key: "course", label: "Curso · Turma" },
    { key: "teacher", label: "Professor" },
    { key: "total", label: "Total", align: "right" },
    { key: "present", label: "Presentes", align: "right" },
    { key: "absent", label: "Ausentes", align: "right" },
    { key: "late", label: "Atrasados", align: "right" },
    { key: "excused", label: "Justificados", align: "right" },
    { key: "adjustment", label: "Ajustes", align: "right" },
    { key: "actions", label: "Ações", align: "right" },
  ];

  const inputClass =
    "w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:w-auto";

  const canApply = hasValidScope(draft);

  const activeFilterCount = [draft.courseId, draft.classId, draft.from, draft.to].filter(Boolean).length;

  return (
    <ManagementPageShell
      backTo="/admin/dashboard-admin"
      title="Frequência dos alunos"
      description="Chamadas já lançadas pelos professores, agrupadas por encontro."
      tableTitle="Chamadas lançadas"
      tableActions={
        <div className="flex flex-wrap items-center gap-3">
          <MobileFilterToggle activeCount={activeFilterCount}>
            <select
              value={draft.courseId}
              onChange={(event) => updateDraft({ courseId: event.target.value })}
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
              <option value="">Selecione a turma</option>
              {filterClasses.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={draft.from}
              onChange={(event) => updateDraft({ from: event.target.value })}
              className={inputClass}
              title="De"
            />

            <input
              type="date"
              value={draft.to}
              onChange={(event) => updateDraft({ to: event.target.value })}
              className={inputClass}
              title="Até"
            />
          </MobileFilterToggle>

          <button
            type="button"
            onClick={apply}
            disabled={!canApply}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
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

          {hasApplied && (
            <ExportPdfButton
              basePath="/api/admin/reports/attendance"
              filters={{ courseId: applied.courseId, classId: applied.classId }}
            />
          )}
        </div>
      }
    >
      {!hasApplied && (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
          <p className="font-semibold text-gray-700">Selecione a turma e clique em Aplicar para consultar a frequência.</p>
          <p className="mt-2 text-sm text-gray-500">Curso e período são refinamentos opcionais.</p>
        </div>
      )}

      {hasApplied && isStale && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
          Os filtros foram alterados -- clique em "Aplicar filtros" para atualizar os resultados abaixo.
        </p>
      )}

      {hasApplied && loading && <p className="py-6 text-center text-gray-500">Carregando chamadas...</p>}

      {hasApplied && !loading && error && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {hasApplied && !loading && !error && (
        <>
          <AdminTable
            columns={columns}
            data={items}
            emptyMessage="Nenhuma chamada lançada para os filtros aplicados."
            renderRow={(item) => (
              <tr key={item.sessionId} className="border-b border-gray-100">
                <td className="px-3 py-3 text-sm font-semibold text-gray-900">
                  Encontro {item.sessionNumber} · {item.title}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">{formatShortDate(item.sessionDate)}</td>
                <td className="px-3 py-3 text-sm text-gray-600">
                  {item.course.name} · {item.class.name}
                </td>
                <td className="px-3 py-3 text-sm text-gray-600">{item.teacher?.name || "-"}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-semibold tabular-nums text-gray-900">{item.total}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-green-700">{item.present}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-red-700">{item.absent}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-amber-700">{item.late}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-blue-700">{item.excused}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right">
                  {item.adjustedCount > 0 ? (
                    <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">
                      {item.adjustedCount}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right">
                  <TableActionButton
                    variant="accent"
                    size="sm"
                    onClick={() => navigate(`/admin/frequencia/encontros/${item.sessionId}`)}
                  >
                    Ver chamada
                  </TableActionButton>
                </td>
              </tr>
            )}
            renderMobileCard={(item) => (
              <MobileExpandableCard
                key={item.sessionId}
                title={`Encontro ${item.sessionNumber} · ${item.title}`}
                subtitle={`${item.course.name} · ${item.class.name}`}
                badge={
                  item.adjustedCount > 0 ? (
                    <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">
                      {item.adjustedCount}
                    </span>
                  ) : null
                }
                primaryAction={
                  <TableActionButton
                    variant="accent"
                    size="md"
                    className="w-full"
                    onClick={() => navigate(`/admin/frequencia/encontros/${item.sessionId}`)}
                  >
                    Ver chamada
                  </TableActionButton>
                }
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Data</span>
                  <span className="font-medium text-gray-900">{formatShortDate(item.sessionDate)}</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Professor</span>
                  <span className="font-medium text-gray-900">{item.teacher?.name || "-"}</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Total</span>
                  <span className="font-medium text-gray-900">{item.total}</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Presentes</span>
                  <span className="font-medium text-gray-900">{item.present}</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Ausentes</span>
                  <span className="font-medium text-gray-900">{item.absent}</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Atrasados</span>
                  <span className="font-medium text-gray-900">{item.late}</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Justificados</span>
                  <span className="font-medium text-gray-900">{item.excused}</span>
                </div>
              </MobileExpandableCard>
            )}
          />

          {pagination.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between gap-4">
              <p className="text-sm text-gray-500">
                Página {pagination.page} de {pagination.totalPages} · {pagination.total} encontro(s)
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
                  onClick={() => setPage((current) => Math.min(current + 1, pagination.totalPages))}
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
  );
}
