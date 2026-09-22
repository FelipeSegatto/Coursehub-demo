import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  getFinancialContractDetails,
  getFinancialContractEvents,
} from "../../../services/FinancialService";
import { API_URL } from "../../../services/APIService";

import ContractStatusBadge from "../../../components/financial/ContractStatusBadge";
import ContractInvoicesTable from "../../../components/financial/ContractInvoicesTable";
import FinancialEventsTimeline from "../../../components/financial/FinancialEventsTimeline";
import AccountAccessCard from "../../../components/financial/AccountAccessCard";
import InvoicePaymentLinkMenu from "../../../components/financial/InvoicePaymentLinkMenu";
import DocumentDownloadButton from "../../../components/documents/DocumentDownloadButton";
import ContractWithdrawalModal from "../../../components/financial/ContractWithdrawalModal";
import { getAdminContractDocumentEndpoints } from "../../../services/DocumentGenerationService";

const WITHDRAWABLE_CONTRACT_STATUSES = ["active", "overdue"];

const CANCELLATION_REASON_LABELS = {
  student_withdrawal: "Desistência do aluno",
};

function getCancellationReasonLabel(value) {
  return CANCELLATION_REASON_LABELS[value] || value;
}

const BILLING_TYPE_LABELS = {
  one_time: "Pagamento único",
  installments: "Parcelado",
  monthly_plan: "Plano mensal",
};

function formatCurrency(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "R$ 0,00";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(numericValue);
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const dateValue =
    typeof value === "string"
      ? value.split("T")[0]
      : value;

  const date = new Date(`${dateValue}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function extractResponseData(response) {
  return response?.data ?? response ?? {};
}

function normalizeContractResponse(response) {
  const result = extractResponseData(response);

  const contract =
    result.contract ??
    result.financialContract ??
    result;

  const invoices =
    result.invoices ??
    contract.invoices ??
    [];

  return {
    contract,
    invoices: Array.isArray(invoices)
      ? invoices
      : [],
  };
}

function normalizeEventsResponse(response) {
  const result = extractResponseData(response);

  const events =
    result.events ??
    result.financialEvents ??
    result;

  return Array.isArray(events) ? events : [];
}

function getErrorMessage(error, fallback) {
  return error?.message || fallback;
}

function DetailItem({
  label,
  value,
  children,
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>

      <dd className="mt-1.5 text-sm font-medium text-slate-800">
        {children ?? value ?? "—"}
      </dd>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  description,
  valueClassName = "text-slate-900",
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">
        {label}
      </p>

      <p
        className={[
          "mt-2 text-2xl font-semibold tracking-tight",
          valueClassName,
        ].join(" ")}
      >
        {value}
      </p>

      {description && (
        <p className="mt-1 text-xs text-slate-500">
          {description}
        </p>
      )}
    </article>
  );
}

function SectionHeader({
  title,
  description,
  action,
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-base font-semibold text-slate-900">
          {title}
        </h2>

        {description && (
          <p className="mt-1 text-sm text-slate-500">
            {description}
          </p>
        )}
      </div>

      {action}
    </header>
  );
}

function LoadingState() {
  return (
    <div
      className="flex min-h-[420px] flex-col items-center justify-center gap-4"
      aria-live="polite"
    >
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />

      <p className="text-sm font-medium text-slate-500">
        Carregando contrato financeiro...
      </p>
    </div>
  );
}

export default function FinancialContractsDetails() {
  const { contratoId } = useParams();
  const navigate = useNavigate();

  const [contract, setContract] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [events, setEvents] = useState([]);

  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] =
    useState(true);

  const [error, setError] = useState("");
  const [eventsError, setEventsError] =
    useState("");

  const [reloadKey, setReloadKey] = useState(0);
  const [eventsReloadKey, setEventsReloadKey] =
    useState(0);

  const [withdrawalModalOpen, setWithdrawalModalOpen] = useState(false);
  const [withdrawalSuccessMessage, setWithdrawalSuccessMessage] = useState("");

  function handleWithdrawalSuccess(message) {
    setWithdrawalSuccessMessage(
      message ||
        "Desistência registrada. O contrato foi encerrado e a matrícula do aluno foi desativada."
    );
    setReloadKey((current) => current + 1);
    setEventsReloadKey((current) => current + 1);
  }

  const loadContract = useCallback(
    async (signal) => {
      try {
        setLoading(true);
        setError("");

        const response =
          await getFinancialContractDetails(
            contratoId
          );

        if (signal.aborted) {
          return;
        }

        const normalized =
          normalizeContractResponse(response);

        setContract(normalized.contract);
        setInvoices(normalized.invoices);
      } catch (requestError) {
        if (signal.aborted) {
          return;
        }

        setContract(null);
        setInvoices([]);

        setError(
          getErrorMessage(
            requestError,
            "Não foi possível carregar o contrato financeiro."
          )
        );
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },
    [contratoId]
  );

  const loadEvents = useCallback(
    async (signal) => {
      try {
        setEventsLoading(true);
        setEventsError("");

        const response =
          await getFinancialContractEvents(
            contratoId
          );

        if (signal.aborted) {
          return;
        }

        setEvents(
          normalizeEventsResponse(response)
        );
      } catch (requestError) {
        if (signal.aborted) {
          return;
        }

        setEvents([]);

        setEventsError(
          getErrorMessage(
            requestError,
            "Não foi possível carregar o histórico financeiro."
          )
        );
      } finally {
        if (!signal.aborted) {
          setEventsLoading(false);
        }
      }
    },
    [contratoId]
  );

  useEffect(() => {
    const controller = new AbortController();

    loadContract(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadContract, reloadKey]);

  useEffect(() => {
    const controller = new AbortController();

    loadEvents(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadEvents, eventsReloadKey]);

  const financialSummary = useMemo(() => {
    if (!contract) {
      return {
        totalAmount: 0,
        paidAmount: 0,
        pendingAmount: 0,
        overdueAmount: 0,
      };
    }

    return {
      totalAmount:
        contract.totalAmount ??
        contract.total_amount ??
        0,

      paidAmount:
        contract.paidAmount ??
        contract.paid_amount ??
        0,

      pendingAmount:
        contract.pendingAmount ??
        contract.pending_amount ??
        0,

      overdueAmount:
        contract.overdueAmount ??
        contract.overdue_amount ??
        0,
    };
  }, [contract]);

  function openInvoice(invoiceId) {
    navigate(
      `/admin/financeiro/cobrancas/${invoiceId}`
    );
  }

  if (loading) {
    return (
      <main className="min-h-full w-full bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[1600px]">
          <LoadingState />
        </div>
      </main>
    );
  }

  if (error || !contract) {
    return (
      <main className="min-h-full w-full bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-[420px] w-full max-w-3xl items-center justify-center">
          <section className="w-full rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-xl font-semibold text-red-600">
              !
            </div>

            <h1 className="mt-5 text-xl font-semibold text-slate-900">
              Não foi possível carregar o contrato
            </h1>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              {error ||
                "O contrato solicitado não foi encontrado."}
            </p>

            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() =>
                  setReloadKey(
                    (current) => current + 1
                  )
                }
                className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Tentar novamente
              </button>

              <button
                type="button"
                onClick={() =>
                  navigate(
                    "/admin/financeiro/contratos"
                  )
                }
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Voltar aos contratos
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const billingType =
    contract.billingType ??
    contract.billing_type;

  const enrollmentId =
    contract.enrollmentId ??
    contract.enrollment_id;

  const planName =
    contract.planName ??
    contract.plan_name;

  const createdAt =
    contract.createdAt ??
    contract.created_at;

  const nextDueDate =
    contract.nextDueDate ??
    contract.next_due_date;

  return (
    <main className="min-h-full w-full bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1600px]">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <button
              type="button"
              onClick={() =>
                navigate(
                  "/admin/financeiro/contratos"
                )
              }
              className="text-sm font-semibold text-blue-600 transition hover:text-blue-800 hover:underline"
            >
              ← Voltar aos contratos
            </button>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                Contrato #{contract.id}
              </h1>

              <ContractStatusBadge
                status={contract.status}
              />

              {contract.status === "cancelled" && contract.cancellationReason && (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                  Motivo: {getCancellationReasonLabel(contract.cancellationReason)}
                </span>
              )}
            </div>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              Consulte os dados do contrato, as
              faturas relacionadas e o histórico
              de operações financeiras.
            </p>

            {withdrawalSuccessMessage && (
              <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm text-emerald-800">{withdrawalSuccessMessage}</p>

                <button
                  type="button"
                  onClick={() => setWithdrawalSuccessMessage("")}
                  aria-label="Fechar aviso"
                  className="shrink-0 text-emerald-600 transition hover:text-emerald-800"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href={`${API_URL}/api/admin/financial/contracts/${contract.id}/terms-document`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
            >
              Ver termo do contrato
            </a>

            <DocumentDownloadButton
              endpoints={getAdminContractDocumentEndpoints(contract.id)}
              label="contrato (PDF)"
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
            />

            <button
              type="button"
              onClick={() =>
                navigate("/admin/financeiro")
              }
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
            >
              Dashboard financeiro
            </button>

            {WITHDRAWABLE_CONTRACT_STATUSES.includes(contract.status) && (
              <button
                type="button"
                onClick={() => setWithdrawalModalOpen(true)}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-red-300 bg-white px-4 text-sm font-semibold text-red-700 shadow-sm transition hover:border-red-400 hover:bg-red-50"
              >
                Registrar desistência
              </button>
            )}
          </div>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Valor total"
            value={formatCurrency(
              financialSummary.totalAmount
            )}
            description="Valor original do contrato"
          />

          <SummaryCard
            label="Valor recebido"
            value={formatCurrency(
              financialSummary.paidAmount
            )}
            valueClassName="text-emerald-700"
            description="Pagamentos confirmados"
          />

          <SummaryCard
            label="Valor pendente"
            value={formatCurrency(
              financialSummary.pendingAmount
            )}
            description="Saldo ainda não recebido"
          />

          <SummaryCard
            label="Valor em atraso"
            value={formatCurrency(
              financialSummary.overdueAmount
            )}
            valueClassName={
              Number(
                financialSummary.overdueAmount
              ) > 0
                ? "text-red-700"
                : "text-slate-900"
            }
            description="Cobranças vencidas"
          />
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <SectionHeader
            title="Informações do contrato"
            description="Dados gerais e configuração da cobrança."
          />

          <dl className="grid gap-6 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <DetailItem
              label="Identificador"
              value={`#${contract.id}`}
            />

            <DetailItem
              label="Matrícula"
              value={
                enrollmentId
                  ? `#${enrollmentId}`
                  : "—"
              }
            />

            <DetailItem
              label="Plano"
              value={
                planName ||
                "Plano não informado"
              }
            />

            <DetailItem label="Status">
              <ContractStatusBadge
                status={contract.status}
              />
            </DetailItem>

            <DetailItem
              label="Tipo de cobrança"
              value={
                BILLING_TYPE_LABELS[
                  billingType
                ] ||
                billingType ||
                "Não informado"
              }
            />

            <DetailItem
              label="Data de criação"
              value={formatDate(createdAt)}
            />

            <DetailItem
              label="Próximo vencimento"
              value={formatDate(nextDueDate)}
            />

            <DetailItem
              label="Quantidade de faturas"
              value={
                contract.invoiceCount ??
                contract.invoice_count ??
                invoices.length
              }
            />
          </dl>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <AccountAccessCard
            userId={contract.student?.userId}
            accountStatus={contract.student?.accountStatus}
          />

          {contract.status === "pending_payment" && contract.activationInvoiceId && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="mb-3 font-semibold text-slate-900">Compartilhar cobrança</h2>
              <InvoicePaymentLinkMenu invoiceId={contract.activationInvoiceId} />
            </div>
          )}
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <SectionHeader
            title="Faturas do contrato"
            description={`${invoices.length} ${
              invoices.length === 1
                ? "fatura encontrada"
                : "faturas encontradas"
            }.`}
            action={
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/admin/financeiro/cobrancas?contratoId=${contract.id}`
                  )
                }
                className="text-sm font-semibold text-blue-600 transition hover:text-blue-800 hover:underline"
              >
                Ver todas as faturas
              </button>
            }
          />

          <ContractInvoicesTable
            invoices={invoices}
            onOpenInvoice={openInvoice}
          />
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <SectionHeader
            title="Histórico financeiro"
            description="Registro cronológico das alterações e operações deste contrato."
            action={
              eventsError ? (
                <button
                  type="button"
                  onClick={() =>
                    setEventsReloadKey(
                      (current) => current + 1
                    )
                  }
                  className="text-sm font-semibold text-blue-600 transition hover:text-blue-800 hover:underline"
                >
                  Tentar novamente
                </button>
              ) : null
            }
          />

          {eventsLoading ? (
            <div className="flex min-h-56 flex-col items-center justify-center gap-3">
              <span className="h-8 w-8 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />

              <p className="text-sm text-slate-500">
                Carregando histórico...
              </p>
            </div>
          ) : eventsError ? (
            <div className="m-5 rounded-xl border border-red-200 bg-red-50 p-4">
              <h3 className="text-sm font-semibold text-red-800">
                Erro ao carregar o histórico
              </h3>

              <p className="mt-1 text-sm text-red-700">
                {eventsError}
              </p>
            </div>
          ) : (
            <FinancialEventsTimeline
              events={events}
            />
          )}
        </section>
      </div>

      <ContractWithdrawalModal
        open={withdrawalModalOpen}
        contractId={contract.id}
        onClose={() => setWithdrawalModalOpen(false)}
        onSuccess={handleWithdrawalSuccess}
      />
    </main>
  );
}