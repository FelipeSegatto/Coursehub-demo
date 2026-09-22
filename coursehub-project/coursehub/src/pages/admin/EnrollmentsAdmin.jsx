import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Repeat, CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import { apiFetch } from "../../services/APIService";

import {
  listEnrollments,
  updateEnrollmentStatus,
  getClassChangeImpact,
  changeEnrollmentClass,
} from "../../services/AdminEnrollmentService";
import { listClasses } from "../../services/AdminClassService";

import ManagementPageShell from "../../components/ui/ManagementPageShell";
import ExportPdfButton from "../../components/reports/ExportPdfButton";
import AdminEnrollmentModal from "../../components/admin/AdminEnrollmentModal";
import AdminTable from "../../components/admin/AdminTable";
import StatusBadge from "../../components/ui/StatusBadge";
import TableActionButton from "../../components/ui/actions/TableActionButton";
import RowActionsMenu from "../../components/ui/actions/RowActionsMenu";
import MobileFilterToggle from "../../components/ui/MobileFilterToggle";
import MobileExpandableCard from "../../components/ui/MobileExpandableCard";
import { formatDisplayDate } from "../../utils/dateUtils";

const STATUS_OPTIONS = [
  { value: "active", label: "Ativas" },
  { value: "inactive", label: "Inativas" },
  { value: "cancelled", label: "Canceladas" },
  { value: "completed", label: "Concluídas" },
  { value: "withdrawn", label: "Desistentes" },
  { value: "pending_activation", label: "Pendentes de ativação" },
];

const PAGE_LIMIT = 10;

// Mesma regra do backend (adminEnrollmentService.js#assertEnrollmentCanBeActivated)
// -- só para desabilitar o botão preventivamente com uma explicação;
// a validação de verdade continua no backend em qualquer um dos dois
// caminhos (este texto é só UX, nunca a garantia de segurança).
function getReactivationBlockedReason(enrollment) {
  const contractStatus = enrollment.financialContract?.status;

  if (contractStatus === "cancelled") {
    return "Contrato cancelado. Reative ou regularize o contrato antes de reativar a matrícula.";
  }

  if (contractStatus === "pending_payment") {
    return "A matrícula só poderá ser ativada após a confirmação do pagamento.";
  }

  return null;
}

function formatShortDate(value) {
  if (!value) return "-";

  return formatDisplayDate(String(value).slice(0, 10), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function EnrollmentsAdmin() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [enrollments, setEnrollments] = useState([]);
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
  const [status, setStatus] = useState(searchParams.get("status") || "");
  // "Alunos sem turma" (card do dashboard) -- filtro à parte do
  // status, não existe no dropdown de status porque não é um valor de
  // enrollments.status.
  const [classStatus, setClassStatus] = useState(searchParams.get("classStatus") || "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  // Mantém a URL sincronizada com os dois filtros que os cards do
  // dashboard usam -- refresh nunca perde o filtro, e o usuário troca/
  // remove normalmente pelos próprios controles abaixo.
  useEffect(() => {
    const params = {};
    if (status) params.status = status;
    if (classStatus) params.classStatus = classStatus;
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, classStatus]);

  const [courses, setCourses] = useState([]);
  const [filterClasses, setFilterClasses] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);

  const [rowActionLoading, setRowActionLoading] = useState(null);
  const [rowActionError, setRowActionError] = useState("");

  const [classChangeTarget, setClassChangeTarget] = useState(null);
  const [classChangeImpact, setClassChangeImpact] = useState(null);
  const [classChangeOptions, setClassChangeOptions] = useState([]);
  const [classChangeSelection, setClassChangeSelection] = useState("");
  const [classChangeReason, setClassChangeReason] = useState("");
  const [classChangeLoading, setClassChangeLoading] = useState(false);
  const [classChangeError, setClassChangeError] = useState("");

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [searchInput]);

  const fetchEnrollments = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const result = await listEnrollments({
        search,
        courseId,
        classId,
        status,
        classStatus,
        from,
        to,
        page,
        limit: PAGE_LIMIT,
      });

      setEnrollments(Array.isArray(result?.data) ? result.data : []);
      setSummary(result?.summary || null);
      setPagination(
        result?.pagination || { page: 1, limit: PAGE_LIMIT, total: 0, totalPages: 1 }
      );
    } catch (requestError) {
      console.error("[EnrollmentsAdmin] erro ao buscar matrículas:", requestError);
      setError(requestError.message || "Não foi possível carregar as matrículas.");
      setEnrollments([]);
    } finally {
      setLoading(false);
    }
  }, [search, courseId, classId, status, classStatus, from, to, page]);

  useEffect(() => {
    fetchEnrollments();
  }, [fetchEnrollments]);

  useEffect(() => {
    let ignoreRequest = false;

    async function loadCourses() {
      try {
        const response = await apiFetch("/api/admin/courses");

        if (!ignoreRequest) {
          setCourses(Array.isArray(response) ? response : []);
        }
      } catch (requestError) {
        if (!ignoreRequest) {
          console.error("Erro ao carregar cursos:", requestError);
        }
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

  async function handleModalSuccess() {
    setModalOpen(false);
    await fetchEnrollments();
  }

  async function handleStatusChange(enrollment, nextStatus) {
    try {
      setRowActionLoading(enrollment.id);
      setRowActionError("");

      await updateEnrollmentStatus(enrollment.id, nextStatus);
      await fetchEnrollments();
    } catch (requestError) {
      console.error("Erro ao alterar status da matrícula:", requestError);
      setRowActionError(requestError.message || "Erro ao alterar status da matrícula.");
    } finally {
      setRowActionLoading(null);
    }
  }

  async function openClassChangeModal(enrollment) {
    setClassChangeTarget(enrollment);
    setClassChangeImpact(null);
    setClassChangeSelection("");
    setClassChangeReason("");
    setClassChangeError("");
    setClassChangeLoading(true);

    try {
      const [impact, classesResponse] = await Promise.all([
        getClassChangeImpact(enrollment.id),
        listClasses({ courseId: enrollment.course.id, status: "active", limit: 100 }),
      ]);

      setClassChangeImpact(impact);
      setClassChangeOptions(
        (classesResponse?.data || []).filter((c) => c.id !== enrollment.class?.id)
      );
    } catch (requestError) {
      console.error("Erro ao carregar impacto da troca de turma:", requestError);
      setClassChangeError(
        requestError.message || "Não foi possível calcular o impacto da troca."
      );
    } finally {
      setClassChangeLoading(false);
    }
  }

  function closeClassChangeModal() {
    if (classChangeLoading) return;

    setClassChangeTarget(null);
    setClassChangeImpact(null);
    setClassChangeError("");
  }

  async function handleConfirmClassChange() {
    if (!classChangeTarget || !classChangeSelection) return;

    try {
      setClassChangeLoading(true);
      setClassChangeError("");

      await changeEnrollmentClass(classChangeTarget.id, {
        newClassId: Number(classChangeSelection),
        reason: classChangeReason,
      });

      closeClassChangeModal();
      await fetchEnrollments();
    } catch (requestError) {
      console.error("Erro ao trocar turma:", requestError);
      setClassChangeError(requestError.message || "Erro ao trocar turma.");
    } finally {
      setClassChangeLoading(false);
    }
  }

  const stats = [
    { title: "Total de matrículas", value: summary?.total ?? 0 },
    { title: "Ativas", value: summary?.active ?? 0, color: "green" },
    { title: "Canceladas", value: summary?.cancelled ?? 0, color: "red" },
    { title: "Concluídas", value: summary?.completed ?? 0, color: "purple" },
  ];

  const columns = [
    { key: "student", label: "Aluno" },
    { key: "course", label: "Curso" },
    { key: "class", label: "Turma" },
    { key: "enrolled_at", label: "Data" },
    { key: "status", label: "Status" },
    { key: "contract", label: "Contrato financeiro" },
    { key: "actions", label: "Ações", align: "right" },
  ];

  const inputClass =
    "w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-xs text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:w-40 truncate";

  const activeFilterCount = [courseId, classId, status].filter(Boolean).length;

  const dateInputClass =
    "w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-xs text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

  const exportButtonClass =
    "inline-flex min-h-[38px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2";

  return (
    <>
      <ManagementPageShell
        backTo="/admin/dashboard-admin"
        title="Gerenciamento de matrículas"
        description="Matricule alunos em cursos e turmas, acompanhe status e contratos financeiros gerados."
        createButtonText="+ Nova matrícula"
        onCreateClick={() => setModalOpen(true)}
        stats={stats}
        tableTitle={
          <span className="flex items-center gap-2">
            Lista de matrículas
            {!loading && (
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500">
                {pagination.total} {pagination.total === 1 ? "resultado" : "resultados"}
              </span>
            )}
          </span>
        }
        tableActions={
          <div className="flex flex-col gap-4">
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

            <div className="grid grid-cols-3 items-center gap-x-3 gap-y-4">
              <input
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  setPage(1);
                }}
                className={dateInputClass}
                title="De"
              />

              <input
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  setPage(1);
                }}
                className={dateInputClass}
                title="Até"
              />

              <ExportPdfButton
                basePath="/api/admin/reports/enrollments"
                filters={{ search, courseId, classId, status, from, to }}
                className={exportButtonClass}
              />
            </div>
          </div>
        }
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder="Buscar por aluno, matrícula ou curso..."
      >
        {classStatus === "unassigned" && (
          <p className="mb-4 flex items-center gap-2 text-sm text-gray-600">
            Mostrando só matrículas ativas sem turma vinculada.
            <button
              type="button"
              onClick={() => {
                setClassStatus("");
                setPage(1);
              }}
              className="font-semibold text-blue-600 hover:underline"
            >
              Remover filtro
            </button>
          </p>
        )}

        {rowActionError && (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {rowActionError}
          </p>
        )}

        {loading && (
          <p className="py-6 text-center text-gray-500">Carregando matrículas...</p>
        )}

        {!loading && error && (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>

            <button
              type="button"
              onClick={fetchEnrollments}
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
              data={enrollments}
              emptyMessage="Nenhuma matrícula encontrada."
              renderRow={(enrollment) => (
                <tr key={enrollment.id} className="border-b border-gray-100">
                  <td className="px-3 py-3">
                    <p className="text-sm font-semibold text-gray-900">
                      {enrollment.student.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {enrollment.student.registrationNumber}
                    </p>
                  </td>

                  <td className="px-3 py-3 text-sm text-gray-600">{enrollment.course.name}</td>
                  <td className="px-3 py-3 text-sm text-gray-600">
                    {enrollment.class?.name || "Sem turma"}
                  </td>

                  <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">
                    {formatShortDate(enrollment.enrolledAt)}
                  </td>

                  <td className="whitespace-nowrap px-3 py-3">
                    <StatusBadge status={enrollment.status} />
                  </td>

                  <td className="whitespace-nowrap px-3 py-3">
                    {enrollment.financialContract ? (
                      <>
                        <StatusBadge status={enrollment.financialContract.status} />

                        {enrollment.financialContract.activationInvoice?.paidAt && (
                          <p className="mt-1 text-xs text-gray-500">
                            Fatura #{enrollment.financialContract.activationInvoice.id} paga em{" "}
                            {formatShortDate(enrollment.financialContract.activationInvoice.paidAt)}
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="text-sm text-gray-400">Sem contrato</span>
                    )}
                  </td>

                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    {enrollment.status === "active" ? (
                      <RowActionsMenu
                        items={[
                          {
                            key: "change-class",
                            label: "Trocar turma",
                            icon: Repeat,
                            variant: "neutral",
                            disabled: rowActionLoading === enrollment.id,
                            onClick: () => openClassChangeModal(enrollment),
                          },
                          {
                            key: "complete",
                            label: "Concluir",
                            icon: CheckCircle2,
                            variant: "neutral",
                            disabled: rowActionLoading === enrollment.id,
                            onClick: () => handleStatusChange(enrollment, "completed"),
                          },
                          {
                            key: "cancel",
                            label: "Cancelar matrícula",
                            icon: XCircle,
                            variant: "danger",
                            separator: true,
                            disabled: rowActionLoading === enrollment.id,
                            holdToConfirm: true,
                            holdDuration: 1200,
                            confirmedLabel: "Cancelada",
                            onClick: () => handleStatusChange(enrollment, "cancelled"),
                          },
                        ]}
                      />
                    ) : (
                      (() => {
                        const blockedReason = getReactivationBlockedReason(enrollment);

                        return (
                          <div className="inline-flex flex-col items-end gap-1">
                            <TableActionButton
                              variant="warning"
                              size="sm"
                              icon={RotateCcw}
                              disabled={rowActionLoading === enrollment.id || Boolean(blockedReason)}
                              title={blockedReason || undefined}
                              onClick={() => handleStatusChange(enrollment, "active")}
                            >
                              Reativar
                            </TableActionButton>

                            {blockedReason && (
                              <p className="max-w-[220px] text-right text-xs text-gray-500">{blockedReason}</p>
                            )}
                          </div>
                        );
                      })()
                    )}
                  </td>
                </tr>
              )}
              renderMobileCard={(enrollment) => {
                const blockedReason =
                  enrollment.status !== "active"
                    ? getReactivationBlockedReason(enrollment)
                    : null;

                return (
                  <MobileExpandableCard
                    key={enrollment.id}
                    title={enrollment.student.name}
                    subtitle={enrollment.student.registrationNumber}
                    badge={<StatusBadge status={enrollment.status} size="sm" />}
                    primaryAction={
                      enrollment.status === "active" ? (
                        <div className="flex justify-end">
                          <RowActionsMenu
                            items={[
                              {
                                key: "change-class",
                                label: "Trocar turma",
                                icon: Repeat,
                                variant: "neutral",
                                disabled: rowActionLoading === enrollment.id,
                                onClick: () => openClassChangeModal(enrollment),
                              },
                              {
                                key: "complete",
                                label: "Concluir",
                                icon: CheckCircle2,
                                variant: "neutral",
                                disabled: rowActionLoading === enrollment.id,
                                onClick: () => handleStatusChange(enrollment, "completed"),
                              },
                              {
                                key: "cancel",
                                label: "Cancelar matrícula",
                                icon: XCircle,
                                variant: "danger",
                                separator: true,
                                disabled: rowActionLoading === enrollment.id,
                                holdToConfirm: true,
                                holdDuration: 1200,
                                confirmedLabel: "Cancelada",
                                onClick: () => handleStatusChange(enrollment, "cancelled"),
                              },
                            ]}
                          />
                        </div>
                      ) : (
                        <div className="flex flex-col items-stretch gap-1">
                          <TableActionButton
                            variant="warning"
                            size="md"
                            icon={RotateCcw}
                            className="w-full"
                            disabled={rowActionLoading === enrollment.id || Boolean(blockedReason)}
                            title={blockedReason || undefined}
                            onClick={() => handleStatusChange(enrollment, "active")}
                          >
                            Reativar
                          </TableActionButton>

                          {blockedReason && (
                            <p className="text-xs text-gray-500">{blockedReason}</p>
                          )}
                        </div>
                      )
                    }
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Curso</span>
                      <span className="font-medium text-gray-900">{enrollment.course.name}</span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Turma</span>
                      <span className="font-medium text-gray-900">
                        {enrollment.class?.name || "Sem turma"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Data</span>
                      <span className="font-medium text-gray-900">
                        {formatShortDate(enrollment.enrolledAt)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Contrato financeiro</span>
                      <span className="font-medium text-gray-900">
                        {enrollment.financialContract ? (
                          <StatusBadge status={enrollment.financialContract.status} size="sm" />
                        ) : (
                          "Sem contrato"
                        )}
                      </span>
                    </div>

                    {enrollment.financialContract?.activationInvoice?.paidAt && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">Fatura paga em</span>
                        <span className="font-medium text-gray-900">
                          #{enrollment.financialContract.activationInvoice.id} ·{" "}
                          {formatShortDate(enrollment.financialContract.activationInvoice.paidAt)}
                        </span>
                      </div>
                    )}
                  </MobileExpandableCard>
                );
              }}
            />

            {pagination.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between gap-4">
                <p className="text-sm text-gray-500">
                  Página {pagination.page} de {pagination.totalPages} ·{" "}
                  {pagination.total} matrícula(s)
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
        <AdminEnrollmentModal
          handleCloseModal={() => setModalOpen(false)}
          onSuccess={handleModalSuccess}
        />
      )}

      {classChangeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-gray-900">Trocar turma</h2>

            <p className="mt-3 rounded-xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-800">
              {classChangeTarget.student.name} · {classChangeTarget.course.name}
            </p>

            {classChangeLoading && !classChangeImpact && (
              <p className="mt-4 text-sm text-gray-500">Calculando impacto...</p>
            )}

            {classChangeError && (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {classChangeError}
              </p>
            )}

            {classChangeImpact && (
              <>
                <p className="mt-4 text-sm text-gray-600">
                  Situação na turma atual ({classChangeTarget.class?.name || "sem turma"}
                  ):
                </p>

                <ul className="mt-2 space-y-1 text-sm text-gray-700">
                  <li>Atividades específicas: {classChangeImpact.oldClassActivities}</li>
                  <li>Conteúdos específicos: {classChangeImpact.oldClassContents}</li>
                  <li>Envios do aluno: {classChangeImpact.oldClassSubmissions}</li>
                  <li>Registros de frequência: {classChangeImpact.oldClassAttendance}</li>
                </ul>

                <p className="mt-3 text-xs text-gray-500">
                  Nada é apagado pela troca — o histórico acima permanece
                  vinculado à turma antiga. O aluno passa a ver apenas os
                  conteúdos/atividades da nova turma a partir de agora.
                </p>

                <label className="mt-4 block text-sm font-medium text-gray-700">
                  Nova turma
                  <select
                    value={classChangeSelection}
                    onChange={(event) => setClassChangeSelection(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="">Selecione a nova turma</option>
                    {classChangeOptions.map((classItem) => (
                      <option key={classItem.id} value={classItem.id}>
                        {classItem.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="mt-4 block text-sm font-medium text-gray-700">
                  Motivo da troca
                  <textarea
                    value={classChangeReason}
                    onChange={(event) => setClassChangeReason(event.target.value)}
                    rows="2"
                    placeholder="Ex: conflito de horário, pedido do aluno..."
                    className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  />
                </label>
              </>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeClassChangeModal}
                disabled={classChangeLoading}
                className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-60"
              >
                Cancelar
              </button>

              {classChangeImpact && (
                <button
                  type="button"
                  onClick={handleConfirmClassChange}
                  disabled={classChangeLoading || !classChangeSelection}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {classChangeLoading ? "Salvando..." : "Confirmar troca"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
