import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../services/APIService";

import { listStudentProgress } from "../../services/AdminStudentProgressService";
import { listClasses } from "../../services/AdminClassService";
import { useAppliedFilters } from "../../hooks/useAppliedFilters";

import ManagementPageShell from "../../components/ui/ManagementPageShell";
import AdminTable from "../../components/admin/AdminTable";
import StatusBadge from "../../components/ui/StatusBadge";
import TableActionButton from "../../components/ui/actions/TableActionButton";
import MobileFilterToggle from "../../components/ui/MobileFilterToggle";
import MobileExpandableCard from "../../components/ui/MobileExpandableCard";

const PAGE_LIMIT = 20;

const STATUS_OPTIONS = [
  { value: "", label: "Ativas" },
  { value: "completed", label: "Concluídas" },
  { value: "cancelled", label: "Canceladas" },
  { value: "inactive", label: "Inativas" },
  { value: "all", label: "Todos os status" },
];

const inputClass =
  "w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:w-auto";

const INITIAL_DRAFT = { search: "", courseId: "", classId: "", status: "" };

function hasValidScope(draft) {
  return Boolean(draft.courseId || draft.classId || draft.search.trim().length >= 3);
}

/**
 * Listagem enxuta -- uma linha por matrícula (o mesmo aluno aparece
 * mais de uma vez se tiver mais de um curso). Sem percentuais, barras
 * ou contagens aqui de propósito: o cálculo detalhado só é carregado
 * quando a diretora abre "Ver progresso" de uma matrícula específica.
 * Só consulta depois de curso, turma ou busca (>=3 caracteres) --
 * status sozinho não libera a consulta.
 */
export default function AdminStudentProgressPage() {
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

    async function fetchItems() {
      try {
        setLoading(true);
        setError("");

        const result = await listStudentProgress({
          search: applied.search,
          courseId: applied.courseId,
          classId: applied.classId,
          status: applied.status,
          page,
          limit: PAGE_LIMIT,
        });

        if (ignoreRequest) return;

        setItems(Array.isArray(result?.data) ? result.data : []);
        setPagination(result?.pagination || { page: 1, limit: PAGE_LIMIT, total: 0, totalPages: 1 });
      } catch (requestError) {
        if (ignoreRequest) return;

        console.error("[AdminStudentProgressPage] erro:", requestError);
        setError(requestError.message || "Não foi possível carregar a progressão dos alunos.");
        setItems([]);
      } finally {
        if (!ignoreRequest) setLoading(false);
      }
    }

    fetchItems();

    return () => {
      ignoreRequest = true;
    };
  }, [applied, page]);

  useEffect(() => {
    let ignoreRequest = false;

    async function loadCourses() {
      try {
        const response = await apiFetch("/api/admin/courses");

        if (!ignoreRequest) {
          setCourses(Array.isArray(response) ? response : []);
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.courseId]);

  const columns = [
    { key: "student", label: "Aluno" },
    { key: "course", label: "Curso" },
    { key: "class", label: "Turma" },
    { key: "status", label: "Status" },
    { key: "actions", label: "Ações", align: "right" },
  ];

  function renderRow(row) {
    return (
      <tr key={row.enrollmentId} className="border-b border-gray-100">
        <td className="px-3 py-3">
          <p className="text-sm font-semibold text-gray-900">{row.student.name}</p>
          <p className="text-xs text-gray-500">{row.student.registrationNumber}</p>
        </td>
        <td className="px-3 py-3 text-sm text-gray-600">{row.course.name}</td>
        <td className="px-3 py-3 text-sm text-gray-600">{row.class?.name || "—"}</td>
        <td className="whitespace-nowrap px-3 py-3">
          <StatusBadge status={row.status} />
        </td>
        <td className="whitespace-nowrap px-3 py-3 text-right">
          <TableActionButton
            variant="accent"
            size="sm"
            onClick={() => navigate(`/admin/progressao/matriculas/${row.enrollmentId}`)}
          >
            Ver progresso
          </TableActionButton>
        </td>
      </tr>
    );
  }

  function renderMobileCard(row) {
    return (
      <MobileExpandableCard
        key={row.enrollmentId}
        title={row.student.name}
        subtitle={row.student.registrationNumber}
        badge={<StatusBadge status={row.status} size="sm" />}
        primaryAction={
          <TableActionButton
            variant="accent"
            size="md"
            className="w-full"
            onClick={() => navigate(`/admin/progressao/matriculas/${row.enrollmentId}`)}
          >
            Ver progresso
          </TableActionButton>
        }
      >
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Curso</span>
          <span className="font-medium text-gray-900">{row.course.name}</span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Turma</span>
          <span className="font-medium text-gray-900">{row.class?.name || "—"}</span>
        </div>
      </MobileExpandableCard>
    );
  }

  const canApply = hasValidScope(draft);

  const activeFilterCount = [draft.courseId, draft.classId, draft.status].filter(Boolean).length;

  return (
    <ManagementPageShell
      backTo="/admin/dashboard-admin"
      title="Progressão dos alunos"
      description="Consulte o progresso acadêmico de cada matrícula e exporte um relatório individual em PDF."
      tableTitle="Matrículas"
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
              <option value="">Todas as turmas</option>
              {filterClasses.map((classItem) => (
                <option key={classItem.id} value={classItem.id}>
                  {classItem.name}
                </option>
              ))}
            </select>

            <select
              value={draft.status}
              onChange={(event) => updateDraft({ status: event.target.value })}
              className={inputClass}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value || "active"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
        </div>
      }
      searchValue={draft.search}
      onSearchChange={(value) => updateDraft({ search: value })}
      searchPlaceholder="Buscar por aluno (mín. 3 caracteres)..."
    >
      {!hasApplied && (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
          <p className="font-semibold text-gray-700">Selecione os filtros e clique em Aplicar para consultar os dados.</p>
          <p className="mt-2 text-sm text-gray-500">Escolha ao menos um curso, turma, ou busque por pelo menos 3 caracteres.</p>
        </div>
      )}

      {hasApplied && isStale && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
          Os filtros foram alterados -- clique em "Aplicar filtros" para atualizar os resultados abaixo.
        </p>
      )}

      {hasApplied && loading && <p className="py-6 text-center text-gray-500">Carregando progressão dos alunos...</p>}

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
            renderRow={renderRow}
            renderMobileCard={renderMobileCard}
            emptyMessage="Nenhuma matrícula encontrada para os filtros selecionados."
          />

          <div className="mt-6 flex items-center justify-between gap-3">
            <p className="text-sm text-gray-500">
              Página {pagination.page} de {pagination.totalPages} · {pagination.total} matrícula(s)
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(current - 1, 1))}
                disabled={pagination.page <= 1}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Anterior
              </button>

              <button
                type="button"
                onClick={() => setPage((current) => Math.min(current + 1, pagination.totalPages))}
                disabled={pagination.page >= pagination.totalPages}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        </>
      )}
    </ManagementPageShell>
  );
}
