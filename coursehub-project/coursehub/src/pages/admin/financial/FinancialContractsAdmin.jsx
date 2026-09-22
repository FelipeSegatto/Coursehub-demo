import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Send, XCircle } from "lucide-react";

import {
  listFinancialContracts,
  cancelFinancialContract,
  sendContractInvoice,
} from "../../../services/FinancialService";

import ManagementPageShell from "../../../components/ui/ManagementPageShell";
import AdminTable from "../../../components/admin/AdminTable";
import DeleteConfirmModal from "../../../components/admin/AdminDeleteModal";
import StatusBadge from "../../../components/ui/StatusBadge";
import ContractCreationModal from "../../../components/financial/ContractCreationModal";
import TableActionButton from "../../../components/ui/actions/TableActionButton";
import RowActionsMenu from "../../../components/ui/actions/RowActionsMenu";
import MobileExpandableCard from "../../../components/ui/MobileExpandableCard";
import { formatDisplayDate } from "../../../utils/dateUtils";

const STATUS_OPTIONS = [
  { value: "", label: "Todos os status" },
  { value: "pending_payment", label: "Aguardando pagamento" },
  { value: "active", label: "Ativos" },
  { value: "overdue", label: "Em atraso" },
  { value: "completed", label: "Concluídos" },
  { value: "cancelled", label: "Cancelados" },
];

const ORIGIN_LABEL = {
  admin: "Comercial (admin)",
  public_checkout: "Checkout público",
  migration: "Migração",
};

const PAGE_LIMIT = 10;

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatShortDate(value) {
  if (!value) return "-";

  return formatDisplayDate(String(value).slice(0, 10), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function FinancialContractsAdmin() {
  const navigate = useNavigate();

  const [contracts, setContracts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_LIMIT, total: 0, totalPages: 1 });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [rowActionLoading, setRowActionLoading] = useState(null);
  const [rowActionError, setRowActionError] = useState("");
  const [rowActionMessage, setRowActionMessage] = useState("");

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [searchInput]);

  const fetchContracts = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const result = await listFinancialContracts({
        search,
        status,
        page,
        limit: PAGE_LIMIT,
      });

      const payload = result?.data ?? result ?? {};

      setContracts(Array.isArray(payload.contracts) ? payload.contracts : []);
      setPagination(payload.pagination || { page: 1, limit: PAGE_LIMIT, total: 0, totalPages: 1 });
    } catch (requestError) {
      console.error("[FinancialContractsAdmin] erro ao buscar contratos:", requestError);
      setError(requestError.message || "Não foi possível carregar os contratos financeiros.");
      setContracts([]);
    } finally {
      setLoading(false);
    }
  }, [search, status, page]);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  async function handleCreateSuccess() {
    setCreateModalOpen(false);
    await fetchContracts();
  }

  async function handleSendInvoice(contract) {
    try {
      setRowActionLoading(contract.id);
      setRowActionError("");
      setRowActionMessage("");

      await sendContractInvoice(contract.id);
      setRowActionMessage("Cobrança reenviada com sucesso.");
    } catch (requestError) {
      setRowActionError(requestError.message || "Erro ao reenviar cobrança.");
    } finally {
      setRowActionLoading(null);
    }
  }

  async function handleConfirmCancel() {
    if (!cancelTarget) return;

    try {
      setRowActionLoading(cancelTarget.id);
      setRowActionError("");

      await cancelFinancialContract(cancelTarget.id, { reason: "Cancelado pelo admin" });

      setCancelTarget(null);
      await fetchContracts();
    } catch (requestError) {
      setRowActionError(requestError.message || "Erro ao cancelar contrato.");
    } finally {
      setRowActionLoading(null);
    }
  }

  const stats = [
    { title: "Total de contratos", value: pagination.total },
    { title: "Nesta página", value: contracts.length },
  ];

  const columns = [
    { key: "id", label: "ID" },
    { key: "student", label: "Aluno" },
    { key: "contracting_party", label: "Contratante" },
    { key: "course_plan", label: "Curso / Plano" },
    { key: "amount", label: "Valor", align: "right" },
    { key: "status", label: "Status" },
    { key: "enrollment", label: "Matrícula" },
    { key: "origin", label: "Origem" },
    { key: "date", label: "Data" },
    { key: "actions", label: "Ações", align: "right" },
  ];

  const inputClass =
    "w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-auto";

  return (
    <>
      <ManagementPageShell
        backTo="/admin/dashboard-admin"
        title="Contratos financeiros"
        description="Contratação administrativa: aluno, contratante, cobrança e ativação de matrícula após pagamento confirmado."
        createButtonText="+ Novo contrato"
        onCreateClick={() => setCreateModalOpen(true)}
        stats={stats}
        tableTitle="Lista de contratos"
        tableActions={
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className={inputClass}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <Link
              to="/admin/financeiro/contratantes"
              className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Contratantes
            </Link>
          </div>
        }
        searchValue={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder="Buscar por aluno, CPF, contratante ou ID..."
      >
        {rowActionMessage && (
          <p className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {rowActionMessage}
          </p>
        )}

        {rowActionError && (
          <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {rowActionError}
          </p>
        )}

        {loading && <p className="py-6 text-center text-gray-500">Carregando contratos...</p>}

        {!loading && error && (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>

            <button
              type="button"
              onClick={fetchContracts}
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
              data={contracts}
              emptyMessage="Nenhum contrato encontrado."
              renderRow={(contract) => (
                <tr key={contract.id} className="border-b border-gray-100">
                  <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">#{contract.id}</td>

                  <td className="px-3 py-3">
                    <p className="text-sm font-semibold text-gray-900">{contract.student?.name || "-"}</p>
                  </td>

                  <td className="px-3 py-3 text-sm text-gray-600">{contract.contractingParty?.name || "-"}</td>

                  <td className="px-3 py-3 text-sm text-gray-600">
                    <p>{contract.course?.name || "-"}</p>
                    <p className="text-xs text-gray-500">{contract.planName}</p>
                  </td>

                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    <p className="text-sm font-semibold tabular-nums text-gray-900">{formatCurrency(contract.totalAmount)}</p>
                    {contract.billingType === "monthly_plan" && contract.monthlyPaymentCount && (
                      <p className="text-xs tabular-nums text-gray-500">
                        {contract.monthlyPaymentCount}x de {formatCurrency(contract.monthlyPaymentAmount)}
                      </p>
                    )}
                  </td>

                  <td className="whitespace-nowrap px-3 py-3">
                    <StatusBadge status={contract.status} />
                  </td>

                  <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">
                    {contract.enrollmentId ? `#${contract.enrollmentId}` : "Não criada"}
                  </td>

                  <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">{ORIGIN_LABEL[contract.origin] || contract.origin}</td>

                  <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">{formatShortDate(contract.createdAt)}</td>

                  <td className="whitespace-nowrap px-3 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <TableActionButton
                        variant="accent"
                        size="sm"
                        onClick={() => navigate(`/admin/financeiro/contratos/${contract.id}`)}
                      >
                        Ver contrato
                      </TableActionButton>

                

                      {contract.status === "pending_payment" && (
                        <RowActionsMenu
                          items={[
                            {
                              key: "resend-invoice",
                              label: "Reenviar cobrança",
                              icon: Send,
                              variant: "neutral",
                              disabled: rowActionLoading === contract.id,
                              onClick: () => handleSendInvoice(contract),
                            },
                            {
                              key: "cancel",
                              label: "Cancelar contrato",
                              icon: XCircle,
                              variant: "danger",
                              separator: true,
                              disabled: rowActionLoading === contract.id,
                              onClick: () => setCancelTarget(contract),
                            },
                          ]}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              )}
              renderMobileCard={(contract) => (
                <MobileExpandableCard
                  key={contract.id}
                  title={`#${contract.id} — ${contract.student?.name || "-"}`}
                  subtitle={contract.contractingParty?.name || "-"}
                  badge={<StatusBadge status={contract.status} size="sm" />}
                  primaryAction={
                    <div className="flex items-center gap-2">
                      <TableActionButton
                        variant="accent"
                        size="md"
                        className="flex-1"
                        onClick={() => navigate(`/admin/financeiro/contratos/${contract.id}`)}
                      >
                        Ver contrato
                      </TableActionButton>

                      {contract.status === "pending_payment" && (
                        <RowActionsMenu
                          items={[
                            {
                              key: "resend-invoice",
                              label: "Reenviar cobrança",
                              icon: Send,
                              variant: "neutral",
                              disabled: rowActionLoading === contract.id,
                              onClick: () => handleSendInvoice(contract),
                            },
                            {
                              key: "cancel",
                              label: "Cancelar contrato",
                              icon: XCircle,
                              variant: "danger",
                              separator: true,
                              disabled: rowActionLoading === contract.id,
                              onClick: () => setCancelTarget(contract),
                            },
                          ]}
                        />
                      )}
                    </div>
                  }
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Curso / Plano</span>
                    <span className="font-medium text-gray-900">
                      {contract.course?.name || "-"}
                      {contract.planName ? ` · ${contract.planName}` : ""}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Valor</span>
                    <span className="font-medium text-gray-900">
                      {formatCurrency(contract.totalAmount)}
                      {contract.billingType === "monthly_plan" && contract.monthlyPaymentCount
                        ? ` (${contract.monthlyPaymentCount}x de ${formatCurrency(contract.monthlyPaymentAmount)})`
                        : ""}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Matrícula</span>
                    <span className="font-medium text-gray-900">
                      {contract.enrollmentId ? `#${contract.enrollmentId}` : "Não criada"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Origem</span>
                    <span className="font-medium text-gray-900">
                      {ORIGIN_LABEL[contract.origin] || contract.origin}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Data</span>
                    <span className="font-medium text-gray-900">{formatShortDate(contract.createdAt)}</span>
                  </div>
                </MobileExpandableCard>
              )}
            />

            {pagination.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between gap-4">
                <p className="text-sm text-gray-500">
                  Página {pagination.page} de {pagination.totalPages} · {pagination.total} contrato(s)
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

      {createModalOpen && (
        <ContractCreationModal
          handleCloseModal={() => setCreateModalOpen(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {cancelTarget && (
        <DeleteConfirmModal
          title="Cancelar contrato"
          description="O contrato e a fatura de ativação em aberto serão cancelados. Isso não afeta uma matrícula já ativa (nenhuma existe ainda para contratos aguardando pagamento)."
          itemName={`Contrato #${cancelTarget.id} — ${cancelTarget.student?.name || ""}`}
          loading={rowActionLoading === cancelTarget.id}
          onCancel={() => setCancelTarget(null)}
          onConfirm={handleConfirmCancel}
        />
      )}
    </>
  );
}
