import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { apiFetch } from "../../services/APIService";

import {
  listMaterials,
  getMaterialImpact,
  deleteMaterial,
  updateMaterialStatus,
} from "../../services/AdminContentService";
import { listClasses } from "../../services/AdminClassService";

import ManagementPageShell from "../../components/ui/ManagementPageShell";
import AdminContentModal from "../../components/admin/AdminContentModal";
import AdminTable from "../../components/admin/AdminTable";
import StatusBadge from "../../components/ui/StatusBadge";
import TableActionButton from "../../components/ui/actions/TableActionButton";
import HoldToConfirmButton from "../../components/ui/actions/HoldToConfirmButton";
import MobileFilterToggle from "../../components/ui/MobileFilterToggle";
import MobileExpandableCard from "../../components/ui/MobileExpandableCard";
import { formatDisplayDate } from "../../utils/dateUtils";

const TYPE_OPTIONS = [
  { value: "video", label: "Vídeo" },
  { value: "pdf", label: "PDF" },
  { value: "text", label: "Texto" },
  { value: "live_class", label: "Aula ao vivo" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
  { value: "draft", label: "Rascunhos" },
  { value: "archived", label: "Arquivados" },
];

const SCOPE_OPTIONS = [
  { value: "general", label: "Geral" },
  { value: "class_specific", label: "Específico por turma" },
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

export default function MaterialsAdmin() {
  const [materials, setMaterials] = useState([]);
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
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [scope, setScope] = useState("");
  const [page, setPage] = useState(1);

  const [courses, setCourses] = useState([]);
  const [filterClasses, setFilterClasses] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [selectedMaterial, setSelectedMaterial] = useState(null);

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

  const fetchMaterials = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const result = await listMaterials({
        search,
        courseId,
        classId,
        type,
        status,
        scope,
        page,
        limit: PAGE_LIMIT,
      });

      setMaterials(Array.isArray(result?.data) ? result.data : []);
      setSummary(result?.summary || null);
      setPagination(
        result?.pagination || { page: 1, limit: PAGE_LIMIT, total: 0, totalPages: 1 }
      );
    } catch (requestError) {
      console.error("[MaterialsAdmin] erro ao buscar materiais:", requestError);
      setError(requestError.message || "Não foi possível carregar os materiais.");
      setMaterials([]);
    } finally {
      setLoading(false);
    }
  }, [search, courseId, classId, type, status, scope, page]);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

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
        if (!ignoreRequest) {
          console.error("Erro ao carregar turmas do curso:", requestError);
        }
      }
    }

    loadClassesForFilter();

    return () => {
      ignoreRequest = true;
    };
  }, [courseId]);

  function handleCreateClick() {
    setModalMode("create");
    setSelectedMaterial(null);
    setModalOpen(true);
  }

  function handleEditClick(material) {
    setModalMode("edit");
    setSelectedMaterial(material);
    setModalOpen(true);
  }

  async function handleModalSuccess() {
    setModalOpen(false);
    setSelectedMaterial(null);
    await fetchMaterials();
  }

  async function handleRemoveClick(material) {
    setImpactTarget(material);
    setImpactData(null);
    setActionError("");
    setImpactLoading(true);

    try {
      const impact = await getMaterialImpact(material.id);
      setImpactData(impact);
    } catch (requestError) {
      console.error("Erro ao calcular impacto do material:", requestError);
      setActionError(
        requestError.message || "Não foi possível calcular o impacto do material."
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

  async function handleConfirmDelete() {
    if (!impactTarget) return;

    try {
      setActionLoading(true);
      setActionError("");

      await deleteMaterial(impactTarget.id);

      closeImpactModal();
      await fetchMaterials();
    } catch (requestError) {
      console.error("Erro ao remover material:", requestError);
      setActionError(requestError.message || "Erro ao remover material.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleArchiveInstead() {
    if (!impactTarget) return;

    try {
      setActionLoading(true);
      setActionError("");

      await updateMaterialStatus(impactTarget.id, "archived");

      closeImpactModal();
      await fetchMaterials();
    } catch (requestError) {
      console.error("Erro ao arquivar material:", requestError);
      setActionError(requestError.message || "Erro ao arquivar material.");
    } finally {
      setActionLoading(false);
    }
  }

  const hasImpact = impactData && impactData.progressRecords > 0;

  const stats = [
    { title: "Total de materiais", value: summary?.total ?? 0 },
    { title: "Ativos", value: summary?.active ?? 0, color: "green" },
    { title: "Inativos/Arquivados", value: summary?.inactiveOrArchived ?? 0, color: "red" },
    { title: "Gerais", value: summary?.general ?? 0 },
    { title: "Específicos por turma", value: summary?.classSpecific ?? 0, color: "purple" },
    { title: "Com prazo", value: summary?.withDueDate ?? 0, color: "yellow" },
  ];

  const columns = [
    { key: "title", label: "Título" },
    { key: "type", label: "Tipo" },
    { key: "course", label: "Curso" },
    { key: "scope", label: "Turma" },
    { key: "is_required", label: "Obrigatório" },
    { key: "due_date", label: "Prazo" },
    { key: "order_index", label: "Ordem", align: "right" },
    { key: "status", label: "Status" },
    { key: "updated_at", label: "Atualizado em" },
    { key: "actions", label: "Ações", align: "right" },
  ];

  const inputClass =
    "w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-xs text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:w-36 truncate";

  const activeFilterCount = [courseId, classId, type, scope, status].filter(Boolean).length;

  return (
    <>
      <ManagementPageShell
        backTo="/admin/dashboard-admin"
        title="Gerenciamento de materiais"
        description="Vídeos, PDFs, textos e aulas ao vivo — gerais do curso ou exclusivos de uma turma."
        createButtonText="+ Novo material"
        onCreateClick={handleCreateClick}
        stats={stats}
        tableTitle="Lista de materiais"
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
              <option value="">Geral e específico</option>
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
        searchPlaceholder="Buscar material ou curso..."
      >
        {actionError && (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {actionError}
          </p>
        )}

        {loading && (
          <p className="py-6 text-center text-gray-500">Carregando materiais...</p>
        )}

        {!loading && error && (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>

            <button
              type="button"
              onClick={fetchMaterials}
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
              data={materials}
              emptyMessage="Nenhum material encontrado."
              renderRow={(material) => (
                <tr key={material.id} className="border-b border-gray-100">
                  <td className="px-3 py-3">
                    <p className="text-sm font-semibold text-gray-900">{material.title}</p>
                  </td>

                  <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">
                    {TYPE_OPTIONS.find((option) => option.value === material.type)?.label ||
                      material.type}
                  </td>

                  <td className="px-3 py-3 text-sm text-gray-600">{material.course?.name || "-"}</td>
                  <td className="px-3 py-3 text-sm text-gray-600">{material.scopeLabel}</td>

                  <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">
                    {material.isRequired ? "Sim" : "Não"}
                  </td>

                  <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">
                    {formatShortDateTime(material.dueDate)}
                  </td>

                  <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-gray-600">{material.orderIndex}</td>

                  <td className="whitespace-nowrap px-3 py-3">
                    <StatusBadge status={material.status} />
                  </td>

                  <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">
                    {formatShortDateTime(material.updatedAt)}
                  </td>

                  <td className="whitespace-nowrap px-3 py-3">
                    <div className="flex justify-end gap-2">
                      <TableActionButton variant="accent" size="sm" onClick={() => handleEditClick(material)}>
                        Editar
                      </TableActionButton>

                      <TableActionButton variant="danger" size="sm" onClick={() => handleRemoveClick(material)}>
                        Remover
                      </TableActionButton>
                    </div>
                  </td>
                </tr>
              )}
              renderMobileCard={(material) => (
                <MobileExpandableCard
                  key={material.id}
                  title={material.title}
                  subtitle={`${
                    TYPE_OPTIONS.find((option) => option.value === material.type)?.label ||
                    material.type
                  }${material.course?.name ? ` · ${material.course.name}` : ""}`}
                  badge={<StatusBadge status={material.status} size="sm" />}
                  primaryAction={
                    <div className="flex items-center gap-2">
                      <TableActionButton
                        variant="accent"
                        size="md"
                        className="flex-1"
                        onClick={() => handleEditClick(material)}
                      >
                        Editar
                      </TableActionButton>

                      <TableActionButton
                        variant="danger"
                        size="md"
                        onClick={() => handleRemoveClick(material)}
                      >
                        Remover
                      </TableActionButton>
                    </div>
                  }
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Turma</span>
                    <span className="font-medium text-gray-900">{material.scopeLabel}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Obrigatório</span>
                    <span className="font-medium text-gray-900">
                      {material.isRequired ? "Sim" : "Não"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Prazo</span>
                    <span className="font-medium text-gray-900">
                      {formatShortDateTime(material.dueDate)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Ordem</span>
                    <span className="font-medium text-gray-900">{material.orderIndex}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Atualizado em</span>
                    <span className="font-medium text-gray-900">
                      {formatShortDateTime(material.updatedAt)}
                    </span>
                  </div>
                </MobileExpandableCard>
              )}
            />

            {pagination.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between gap-4">
                <p className="text-sm text-gray-500">
                  Página {pagination.page} de {pagination.totalPages} ·{" "}
                  {pagination.total} material(is)
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
        <AdminContentModal
          mode={modalMode}
          initialData={selectedMaterial}
          handleCloseModal={() => setModalOpen(false)}
          onSuccess={handleModalSuccess}
        />
      )}

      {impactTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-gray-900">Remover material</h2>

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
                      Este material já possui progresso registrado por alunos e não
                      pode ser removido permanentemente:
                    </p>

                    <ul className="mt-3 space-y-1 text-sm text-gray-700">
                      <li>Registros de progresso: {impactData.progressRecords}</li>
                    </ul>

                    <p className="mt-4 text-sm text-gray-600">
                      Você pode arquivar o material em vez de excluí-lo — o
                      histórico é preservado.
                    </p>
                  </>
                ) : (
                  <p className="mt-4 text-sm text-gray-600">
                    Este material não possui progresso registrado — pode ser
                    removido permanentemente.
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
                  {actionLoading ? "Arquivando..." : "Arquivar material"}
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
