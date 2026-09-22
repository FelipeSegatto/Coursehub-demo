import { useEffect, useState } from "react";

import { listContractingParties } from "../../../services/ContractingPartyService";
import { useAppliedFilters } from "../../../hooks/useAppliedFilters";

import ManagementPageShell from "../../../components/ui/ManagementPageShell";
import AdminTable from "../../../components/admin/AdminTable";
import AdminStatusFilter from "../../../components/admin/AdminStatusFilter";
import TableActionButton from "../../../components/ui/actions/TableActionButton";
import StatusBadge from "../../../components/ui/StatusBadge";
import MobileExpandableCard from "../../../components/ui/MobileExpandableCard";
import EditContractingPartyContactModal from "../../../components/financial/EditContractingPartyContactModal";
import { formatDisplayDate } from "../../../utils/dateUtils";

const PAGE_LIMIT = 20;

const PARTY_TYPE_LABEL = {
  individual: "Pessoa física",
  company: "Empresa",
};

const DOCUMENT_TYPE_LABEL = {
  cpf: "CPF",
  cnpj: "CNPJ",
  other: "Outro",
};

const STATUS_OPTIONS = [
  { value: "active", label: "Ativos" },
  { value: "inactive", label: "Inativos" },
];

const INITIAL_DRAFT = { search: "", status: "" };

function formatShortDateTime(value) {
  if (!value) return "-";

  return `${formatDisplayDate(String(value).slice(0, 10), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })} ${String(value).slice(11, 16)}`;
}

const inputClass =
  "w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-auto";

/**
 * Cadastro mestre dos contratantes -- só permite editar e-mail/
 * telefone por aqui (ver EditContractingPartyContactModal). Editar o
 * cadastro atual nunca altera contratos já criados, que guardam seu
 * próprio snapshot (contracting_party_name/document/email/phone/
 * address) congelado no momento da contratação.
 */
export default function ContractingPartiesAdmin() {
  const { draft, updateDraft, applied, hasApplied, isStale, apply, clear, page, setPage } =
    useAppliedFilters(INITIAL_DRAFT);

  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_LIMIT, total: 0, totalPages: 1 });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [editTarget, setEditTarget] = useState(null);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!applied) return;

    let ignoreRequest = false;

    async function fetchParties() {
      try {
        setLoading(true);
        setError("");

        const result = await listContractingParties({
          search: applied.search,
          status: applied.status,
          page,
          limit: PAGE_LIMIT,
        });

        if (ignoreRequest) return;

        setItems(Array.isArray(result?.data) ? result.data : []);
        setPagination(result?.pagination || { page: 1, limit: PAGE_LIMIT, total: 0, totalPages: 1 });
      } catch (requestError) {
        if (ignoreRequest) return;

        console.error("[ContractingPartiesAdmin] erro:", requestError);
        setError(requestError.message || "Não foi possível carregar os contratantes.");
        setItems([]);
      } finally {
        if (!ignoreRequest) setLoading(false);
      }
    }

    fetchParties();

    return () => {
      ignoreRequest = true;
    };
  }, [applied, page]);

  function handleEditSuccess(updatedParty) {
    setItems((current) =>
      current.map((item) => (item.id === updatedParty.id ? updatedParty : item))
    );

    setEditTarget(null);
    setFeedback("Contato do contratante atualizado com sucesso.");
  }

  const columns = [
    { key: "name", label: "Nome" },
    { key: "document", label: "CPF/CNPJ" },
    { key: "email", label: "E-mail" },
    { key: "phone", label: "Telefone" },
    { key: "type", label: "Tipo" },
    { key: "status", label: "Status" },
    { key: "updated_at", label: "Última atualização" },
    { key: "actions", label: "Ações", align: "right" },
  ];

  return (
    <>
      <ManagementPageShell
        backTo="/admin/dashboard-admin"
        title="Contratantes"
        description="Consulte os responsáveis financeiros cadastrados e atualize o telefone e o e-mail de contato."
        tableTitle="Lista de contratantes"
        tableActions={
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={draft.search}
              onChange={(event) => updateDraft({ search: event.target.value })}
              placeholder="Nome, documento ou e-mail..."
              className={inputClass}
            />

            <AdminStatusFilter
              value={draft.status}
              onChange={(value) => updateDraft({ status: value })}
              options={STATUS_OPTIONS}
            />

            <button
              type="button"
              onClick={apply}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
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
      >
        {feedback && (
          <p className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {feedback}
          </p>
        )}

        {!hasApplied && (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
            <p className="font-semibold text-gray-700">Aplique um filtro para consultar os contratantes.</p>
            <p className="mt-2 text-sm text-gray-500">
              Busque por nome, documento ou e-mail, ou clique em "Aplicar filtros" sem preencher nada para ver todos.
            </p>
          </div>
        )}

        {hasApplied && isStale && (
          <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700">
            Os filtros foram alterados -- clique em "Aplicar filtros" para atualizar os resultados abaixo.
          </p>
        )}

        {hasApplied && loading && <p className="py-6 text-center text-gray-500">Carregando contratantes...</p>}

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
              emptyMessage="Nenhum contratante encontrado para os filtros aplicados."
              renderRow={(party) => (
                <tr key={party.id} className="border-b border-gray-100">
                  <td className="px-3 py-3 text-sm font-semibold text-gray-900">{party.name}</td>

                  <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">
                    {party.documentNumber || "-"}
                  </td>

                  <td className="px-3 py-3 text-sm text-gray-600">{party.email || "-"}</td>

                  <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">{party.phone || "-"}</td>

                  <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">
                    {PARTY_TYPE_LABEL[party.partyType] || party.partyType}
                  </td>

                  <td className="whitespace-nowrap px-3 py-3">
                    <StatusBadge status={party.status} />
                  </td>

                  <td className="whitespace-nowrap px-3 py-3 text-sm text-gray-600">
                    {formatShortDateTime(party.updatedAt)}
                  </td>

                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    <TableActionButton variant="accent" size="sm" onClick={() => setEditTarget(party)}>
                      Editar contato
                    </TableActionButton>
                  </td>
                </tr>
              )}
              renderMobileCard={(party) => (
                <MobileExpandableCard
                  key={party.id}
                  title={party.name}
                  subtitle={party.documentNumber || "-"}
                  badge={<StatusBadge status={party.status} size="sm" />}
                  primaryAction={
                    <TableActionButton
                      variant="accent"
                      size="md"
                      className="w-full"
                      onClick={() => setEditTarget(party)}
                    >
                      Editar contato
                    </TableActionButton>
                  }
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">E-mail</span>
                    <span className="font-medium text-gray-900">{party.email || "-"}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Telefone</span>
                    <span className="font-medium text-gray-900">{party.phone || "-"}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Tipo</span>
                    <span className="font-medium text-gray-900">
                      {PARTY_TYPE_LABEL[party.partyType] || party.partyType}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Última atualização</span>
                    <span className="font-medium text-gray-900">{formatShortDateTime(party.updatedAt)}</span>
                  </div>
                </MobileExpandableCard>
              )}
            />

            {pagination.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between gap-4">
                <p className="text-sm text-gray-500">
                  Página {pagination.page} de {pagination.totalPages} · {pagination.total} contratante(s)
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

      <EditContractingPartyContactModal
        open={Boolean(editTarget)}
        party={editTarget}
        documentTypeLabel={editTarget ? DOCUMENT_TYPE_LABEL[editTarget.documentType] || editTarget.documentType : ""}
        onClose={() => setEditTarget(null)}
        onSuccess={handleEditSuccess}
      />
    </>
  );
}
