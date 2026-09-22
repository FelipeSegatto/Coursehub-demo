import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { apiFetch } from "../../services/APIService";

import { listStudentProgress } from "../../services/TeacherStudentProgressService";

import ManagementPageShell from "../../components/ui/ManagementPageShell";
import AdminTable from "../../components/admin/AdminTable";
import StatusBadge from "../../components/ui/StatusBadge";
import TableActionButton from "../../components/ui/actions/TableActionButton";
import MobileFilterToggle from "../../components/ui/MobileFilterToggle";
import MobileExpandableCard from "../../components/ui/MobileExpandableCard";

const PAGE_LIMIT = 20;

const inputClass =
  "w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-xs text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:w-44 truncate";

/**
 * Igual à visão admin (AdminStudentProgressPage) na estrutura e no
 * detalhe reaproveitado (mesmos gráficos, mesmo PDF), mas o universo
 * já é só as turmas do professor -- por isso, ao contrário da versão
 * admin, carrega direto (sem exigir "Aplicar filtros") e os filtros
 * ficam só em curso e turma, sem status nem busca por nome.
 */
export default function TeacherStudentProgressPage() {
  const { usuarioLogado } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_LIMIT, total: 0, totalPages: 1 });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [courseId, setCourseId] = useState("");
  const [classId, setClassId] = useState("");
  const [page, setPage] = useState(1);

  const [courses, setCourses] = useState([]);
  const [filterClasses, setFilterClasses] = useState([]);

  useEffect(() => {
    if (!usuarioLogado?.id) return;

    let ignoreRequest = false;

    async function fetchItems() {
      try {
        setLoading(true);
        setError("");

        const result = await listStudentProgress(usuarioLogado.id, {
          courseId,
          classId,
          page,
          limit: PAGE_LIMIT,
        });

        if (ignoreRequest) return;

        setItems(Array.isArray(result?.data) ? result.data : []);
        setPagination(result?.pagination || { page: 1, limit: PAGE_LIMIT, total: 0, totalPages: 1 });
      } catch (requestError) {
        if (ignoreRequest) return;

        console.error("[TeacherStudentProgressPage] erro:", requestError);
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
  }, [usuarioLogado?.id, courseId, classId, page]);

  useEffect(() => {
    if (!usuarioLogado?.id) return;

    let ignoreRequest = false;

    async function loadCourses() {
      try {
        const response = await apiFetch(`/api/teacher/by-user/${usuarioLogado.id}/courses`);

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
  }, [usuarioLogado?.id]);

  useEffect(() => {
    if (!usuarioLogado?.id || !courseId) {
      setFilterClasses([]);
      setClassId("");
      return;
    }

    let ignoreRequest = false;

    async function loadClassesForFilter() {
      try {
        const response = await apiFetch(`/api/teacher/by-user/${usuarioLogado.id}/classes`);

        const classList = Array.isArray(response)
          ? response
          : Array.isArray(response?.classes)
            ? response.classes
            : [];

        if (!ignoreRequest) {
          setFilterClasses(classList.filter((classItem) => Number(classItem.courseId) === Number(courseId)));
        }
      } catch (requestError) {
        if (!ignoreRequest) console.error("Erro ao carregar turmas do curso:", requestError);
      }
    }

    loadClassesForFilter();

    return () => {
      ignoreRequest = true;
    };
  }, [usuarioLogado?.id, courseId]);

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
            onClick={() => navigate(`/professor/progressao/matriculas/${row.enrollmentId}`)}
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
            onClick={() => navigate(`/professor/progressao/matriculas/${row.enrollmentId}`)}
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

  const activeFilterCount = [courseId, classId].filter(Boolean).length;

  return (
    <ManagementPageShell
      backTo="/professor/dashboard-professor"
      title="Progressão dos alunos"
      description="Consulte o progresso acadêmico dos alunos das suas turmas e exporte um relatório individual em PDF."
      tableTitle="Matrículas"
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
        </MobileFilterToggle>
      }
    >
      {loading && <p className="py-6 text-center text-gray-500">Carregando progressão dos alunos...</p>}

      {!loading && error && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <>
          <AdminTable
            columns={columns}
            data={items}
            renderRow={renderRow}
            renderMobileCard={renderMobileCard}
            emptyMessage="Nenhuma matrícula encontrada para os filtros selecionados."
          />

          {pagination.totalPages > 1 && (
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
          )}
        </>
      )}
    </ManagementPageShell>
  );
}
