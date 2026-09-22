import { useCallback, useEffect, useState } from "react";
import { Power, Trash2 } from "lucide-react";
import { apiFetch } from "../../services/APIService";

import {
  listPricingPlans,
  updatePricingPlanStatus,
  deletePricingPlan,
} from "../../services/AdminPricingPlanService";

import ManagementPageShell from "../../components/ui/ManagementPageShell";
import PricingPlanModal from "../../components/admin/PricingPlanModal";
import DeleteConfirmModal from "../../components/admin/AdminDeleteModal";
import AdminTable from "../../components/admin/AdminTable";
import StatusBadge from "../../components/ui/StatusBadge";
import TableActionButton from "../../components/ui/actions/TableActionButton";
import RowActionsMenu from "../../components/ui/actions/RowActionsMenu";
import MobileFilterToggle from "../../components/ui/MobileFilterToggle";
import MobileExpandableCard from "../../components/ui/MobileExpandableCard";

const BILLING_TYPE_OPTIONS = [
  { value: "one_time", label: "Pagamento único" },
  { value: "monthly_plan", label: "Plano mensal" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
];

const PAGE_LIMIT = 10;

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function billingTypeLabel(value) {
  return BILLING_TYPE_OPTIONS.find((option) => option.value === value)?.label || value;
}

function paymentMethodsLabel(plan) {
  const methods = [];

  if (plan.acceptsPix) methods.push("Pix");
  if (plan.acceptsBoleto) methods.push("Boleto");
  if (plan.acceptsCreditCard) methods.push("Cartão");

  return methods.length > 0 ? methods.join(", ") : "-";
}

export default function PricingPlansAdmin() {
  const [plans, setPlans] = useState([]);
  const [courses, setCourses] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_LIMIT, total: 0, totalPages: 1 });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [courseId, setCourseId] = useState("");
  const [billingType, setBillingType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  const [selectedPlan, setSelectedPlan] = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [rowActionLoading, setRowActionLoading] = useState(null);
  const [rowActionError, setRowActionError] = useState("");

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    let ignoreRequest = false;

    async function fetchCourses() {
      try {
        const response = await apiFetch("/api/admin/courses");
        const courseList = Array.isArray(response)
          ? response
          : Array.isArray(response?.data)
            ? response.data
            : [];

        if (!ignoreRequest) {
          setCourses(courseList);
        }
      } catch (requestError) {
        console.error("[PricingPlansAdmin] erro ao buscar cursos:", requestError);
      }
    }

    fetchCourses();

    return () => {
      ignoreRequest = true;
    };
  }, []);

  const fetchPlans = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const result = await listPricingPlans({
        search,
        courseId,
        billingType,
        status,
        page,
        limit: PAGE_LIMIT,
      });

      setPlans(Array.isArray(result?.data) ? result.data : []);
      setPagination(result?.pagination || { page: 1, limit: PAGE_LIMIT, total: 0, totalPages: 1 });
    } catch (requestError) {
      console.error("[PricingPlansAdmin] erro ao buscar planos:", requestError);
      setError(requestError.message || "Não foi possível carregar os planos comerciais.");
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [search, courseId, billingType, status, page]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  function handleCreateClick() {
    setModalMode("create");
    setSelectedPlan(null);
    setModalOpen(true);
  }

  function handleEditClick(plan) {
    setModalMode("edit");
    setSelectedPlan(plan);
    setModalOpen(true);
  }

  async function handleModalSuccess() {
    setModalOpen(false);
    setSelectedPlan(null);
    await fetchPlans();
  }

  async function handleToggleStatus(plan) {
    const nextStatus = plan.status === "active" ? "inactive" : "active";

    try {
      setRowActionLoading(plan.id);
      setRowActionError("");

      await updatePricingPlanStatus(plan.id, nextStatus);
      await fetchPlans();
    } catch (requestError) {
      console.error("Erro ao alterar status do plano:", requestError);
      setRowActionError(requestError.message || "Erro ao alterar status do plano.");
    } finally {
      setRowActionLoading(null);
    }
  }

  function handleDeleteClick(plan) {
    setDeleteTarget(plan);
    setRowActionError("");
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;

    try {
      setRowActionLoading(deleteTarget.id);
      setRowActionError("");

      await deletePricingPlan(deleteTarget.id);

      setDeleteTarget(null);
      await fetchPlans();
    } catch (requestError) {
      console.error("Erro ao remover plano:", requestError);
      setRowActionError(requestError.message || "Erro ao remover plano.");
    } finally {
      setRowActionLoading(null);
    }
  }

  const stats = [
    { title: "Total de planos", value: pagination.total },
    { title: "Nesta página", value: plans.length },
  ];

  const columns = [
    { key: "plan", label: "Plano" },
    { key: "course", label: "Curso" },
    { key: "billing_type", label: "Tipo de cobrança" },
    { key: "amount", label: "Valor", align: "right" },
    { key: "methods", label: "Formas de pagamento" },
    { key: "contracts", label: "Contratos", align: "right" },
    { key: "status", label: "Status" },
    { key: "actions", label: "Ações", align: "right" },
  ];

  const inputClass =
    "w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:w-auto";

  const activeFilterCount = [courseId, billingType, status].filter(Boolean).length;

  return (
    <>
      <ManagementPageShell
        backTo="/admin/dashboard-admin"
        title="Planos comerciais"
        description="Gerencie os planos de preço associados a cada curso. Editar um plano afeta somente contratos futuros."
        createButtonText="+ Novo plano"
        onCreateClick={handleCreateClick}
        stats={stats}
        tableTitle="Lista de planos comerciais"
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
              value={billingType}
              onChange={(event) => {
                setBillingType(event.target.value);
                setPage(1);
              }}
              className={inputClass}
            >
              <option value="">Todos os tipos</option>
              {BILLING_TYPE_OPTIONS.map((option) => (
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
        searchPlaceholder="Buscar por nome do plano ou curso..."
      >
        {rowActionError && (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {rowActionError}
          </p>
        )}

        {loading && <p className="py-6 text-center text-gray-500">Carregando planos comerciais...</p>}

        {!loading && error && (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>

            <button
              type="button"
              onClick={fetchPlans}
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
              data={plans}
              emptyMessage="Nenhum plano comercial encontrado."
              renderRow={(plan) => (
                <tr key={plan.id} className="border-b border-gray-100">
                  <td className="px-3 py-3">
                    <p className="text-sm font-semibold text-gray-900">{plan.name}</p>
                    {plan.description && (
                      <p className="mt-1 max-w-xs text-xs text-gray-500">{plan.description}</p>
                    )}
                  </td>

                  <td className="px-3 py-3 text-sm text-gray-600">{plan.courseName}</td>

                  <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">{billingTypeLabel(plan.billingType)}</td>

                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    <p className="text-sm font-semibold tabular-nums text-gray-900">{formatCurrency(plan.totalAmount)}</p>
                    {plan.billingType === "monthly_plan" && plan.monthlyPaymentCount && (
                      <p className="text-xs tabular-nums text-gray-500">
                        {plan.monthlyPaymentCount}x de {formatCurrency(plan.monthlyPaymentAmount)}
                      </p>
                    )}
                  </td>

                  <td className="px-3 py-3 text-sm text-gray-600">{paymentMethodsLabel(plan)}</td>

                  <td className="whitespace-nowrap px-3 py-3 text-right text-sm tabular-nums text-gray-600">{plan.contractCount}</td>

                  <td className="whitespace-nowrap px-3 py-3">
                    <StatusBadge status={plan.status} />
                  </td>

                  <td className="whitespace-nowrap px-3 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <TableActionButton variant="accent" size="sm" onClick={() => handleEditClick(plan)}>
                        Editar
                      </TableActionButton>

                      <RowActionsMenu
                        items={[
                          {
                            key: "toggle-status",
                            label: plan.status === "active" ? "Inativar" : "Ativar",
                            icon: Power,
                            variant: "warning",
                            disabled: rowActionLoading === plan.id,
                            onClick: () => handleToggleStatus(plan),
                          },
                          {
                            key: "remove",
                            label: "Remover",
                            icon: Trash2,
                            variant: "danger",
                            separator: true,
                            disabled: rowActionLoading === plan.id || plan.status === "inactive",
                            title: plan.status === "inactive" ? "Este plano já está inativo." : undefined,
                            onClick: () => handleDeleteClick(plan),
                          },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              )}
              renderMobileCard={(plan) => (
                <MobileExpandableCard
                  key={plan.id}
                  title={plan.name}
                  subtitle={plan.courseName}
                  badge={<StatusBadge status={plan.status} size="sm" />}
                  primaryAction={
                    <div className="flex items-center gap-2">
                      <TableActionButton
                        variant="accent"
                        size="md"
                        className="flex-1"
                        onClick={() => handleEditClick(plan)}
                      >
                        Editar
                      </TableActionButton>

                      <RowActionsMenu
                        items={[
                          {
                            key: "toggle-status",
                            label: plan.status === "active" ? "Inativar" : "Ativar",
                            icon: Power,
                            variant: "warning",
                            disabled: rowActionLoading === plan.id,
                            onClick: () => handleToggleStatus(plan),
                          },
                          {
                            key: "remove",
                            label: "Remover",
                            icon: Trash2,
                            variant: "danger",
                            separator: true,
                            disabled: rowActionLoading === plan.id || plan.status === "inactive",
                            title: plan.status === "inactive" ? "Este plano já está inativo." : undefined,
                            onClick: () => handleDeleteClick(plan),
                          },
                        ]}
                      />
                    </div>
                  }
                >
                  {plan.description && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Descrição</span>
                      <span className="font-medium text-gray-900">{plan.description}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Tipo de cobrança</span>
                    <span className="font-medium text-gray-900">{billingTypeLabel(plan.billingType)}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Valor</span>
                    <span className="font-medium text-gray-900">
                      {formatCurrency(plan.totalAmount)}
                      {plan.billingType === "monthly_plan" && plan.monthlyPaymentCount
                        ? ` (${plan.monthlyPaymentCount}x de ${formatCurrency(plan.monthlyPaymentAmount)})`
                        : ""}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Formas de pagamento</span>
                    <span className="font-medium text-gray-900">{paymentMethodsLabel(plan)}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Contratos</span>
                    <span className="font-medium text-gray-900">{plan.contractCount}</span>
                  </div>
                </MobileExpandableCard>
              )}
            />

            {pagination.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between gap-4">
                <p className="text-sm text-gray-500">
                  Página {pagination.page} de {pagination.totalPages} · {pagination.total} plano(s)
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

      {modalOpen && (
        <PricingPlanModal
          mode={modalMode}
          initialData={selectedPlan}
          handleCloseModal={() => setModalOpen(false)}
          onSuccess={handleModalSuccess}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          title="Remover plano comercial"
          description="Isso inativa o plano (soft delete) — ele deixa de aparecer para novas matrículas, mas contratos já criados com este plano continuam válidos."
          itemName={deleteTarget.name}
          loading={rowActionLoading === deleteTarget.id}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </>
  );
}
