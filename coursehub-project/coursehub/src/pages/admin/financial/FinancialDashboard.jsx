import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";

import { getFinancialDashboardSummary } from "../../../services/FinancialService";

import FinancialSummaryCards from "../../../components/financial/FinancialSummaryCards";
import PrintPageButton from "../../../components/reports/PrintPageButton";

function extractResponseData(response) {
  return response?.data ?? response ?? {};
}

function normalizeSummary(response) {
  const result = extractResponseData(response);

  return {
    totalContracted:
      result.totalContracted ??
      result.total_contracted ??
      0,

    totalReceived:
      result.totalReceived ??
      result.total_received ??
      0,

    totalPending:
      result.totalPending ??
      result.total_pending ??
      0,

    totalOverdue:
      result.totalOverdue ??
      result.total_overdue ??
      0,

    activeContracts:
      result.activeContracts ??
      result.active_contracts ??
      0,

    overdueContracts:
      result.overdueContracts ??
      result.overdue_contracts ??
      0,

    pendingInvoices:
      result.pendingInvoices ??
      result.pending_invoices ??
      0,

    overdueInvoices:
      result.overdueInvoices ??
      result.overdue_invoices ??
      0,

    paidInvoices:
      result.paidInvoices ??
      result.paid_invoices ??
      0,

    recentInvoices:
      Array.isArray(result.recentInvoices)
        ? result.recentInvoices
        : [],
  };
}

function MetricCard({
  label,
  value,
  description,
  danger = false,
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">
        {label}
      </p>

      <p
        className={[
          "mt-2 text-3xl font-semibold",
          danger
            ? "text-red-700"
            : "text-slate-900",
        ].join(" ")}
      >
        {value}
      </p>

      <p className="mt-1 text-xs text-slate-500">
        {description}
      </p>
    </article>
  );
}

export default function FinancialDashboard() {
  const navigate = useNavigate();

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] =
    useState(true);
  const [error, setError] = useState("");

  const loadSummary = useCallback(async () => {
  

  try {
    setLoading(true);
    setError("");

    const response =
      await getFinancialDashboardSummary();

    

    const normalized =
      normalizeSummary(response);

    

    setSummary(normalized);
  } catch (requestError) {
    console.error(
      "[FinancialDashboard] erro:",
      requestError
    );

    setError(
      requestError?.message ||
        "Não foi possível carregar o dashboard financeiro."
    );
  } finally {
   

    setLoading(false);
  }
}, []);

useEffect(() => {
 

  loadSummary();
}, [loadSummary]);

  return (
    <main className="min-h-full bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="print-area mx-auto max-w-[1600px]">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">
              Administração
            </span>

            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Dashboard financeiro
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Acompanhe contratos, recebimentos,
              pendências e cobranças em atraso.
            </p>
          </div>

          <div className="flex gap-3 print-hide">
            <button
              type="button"
              onClick={loadSummary}
              disabled={loading}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Atualizar dados
            </button>

            <PrintPageButton />
          </div>
        </header>

        {error && (
          <div className="mt-6 flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">
              {error}
            </p>

            <button
              type="button"
              onClick={loadSummary}
              className="print-hide text-sm font-semibold text-red-700 hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {loading && !summary ? (
          <div className="flex min-h-[420px] items-center justify-center">
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
          </div>
        ) : (
          <>
            <div className="mt-6">
              <FinancialSummaryCards
                summary={summary}
              />
            </div>

            <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard
                label="Contratos ativos"
                value={
                  summary?.activeContracts ?? 0
                }
                description="Contratos atualmente vigentes"
              />

              <MetricCard
                label="Contratos em atraso"
                value={
                  summary?.overdueContracts ?? 0
                }
                description="Contratos com pendências vencidas"
                danger={
                  Number(
                    summary?.overdueContracts
                  ) > 0
                }
              />

              <MetricCard
                label="Faturas pendentes"
                value={
                  summary?.pendingInvoices ?? 0
                }
                description="Aguardando pagamento"
              />

              <MetricCard
                label="Faturas vencidas"
                value={
                  summary?.overdueInvoices ?? 0
                }
                description="Cobranças fora do prazo"
                danger={
                  Number(
                    summary?.overdueInvoices
                  ) > 0
                }
              />

              <MetricCard
                label="Faturas pagas"
                value={
                  summary?.paidInvoices ?? 0
                }
                description="Pagamentos confirmados"
              />
            </section>

            <section className="print-hide mt-6 grid gap-5 lg:grid-cols-2">
              <button
                type="button"
                onClick={() =>
                  navigate(
                    "/admin/financeiro/contratos"
                  )
                }
                className={[
                  "group rounded-2xl border",
                  "border-slate-200 bg-white",
                  "p-6 text-left shadow-sm",
                  "transition hover:-translate-y-0.5",
                  "hover:border-blue-300",
                  "hover:shadow-md",
                ].join(" ")}
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                  Contratos
                </span>

                <h2 className="mt-3 text-xl font-semibold text-slate-900">
                  Gerenciar contratos financeiros
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Consulte contratos, planos,
                  valores recebidos, pendências e
                  histórico de alterações.
                </p>

                <span className="mt-5 inline-block text-sm font-semibold text-blue-600 group-hover:underline">
                  Abrir contratos →
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  navigate(
                    "/admin/financeiro/cobrancas"
                  )
                }
                className={[
                  "group rounded-2xl border",
                  "border-slate-200 bg-white",
                  "p-6 text-left shadow-sm",
                  "transition hover:-translate-y-0.5",
                  "hover:border-blue-300",
                  "hover:shadow-md",
                ].join(" ")}
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                  Faturas
                </span>

                <h2 className="mt-3 text-xl font-semibold text-slate-900">
                  Gerenciar faturas e pagamentos
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Altere vencimentos, registre
                  pagamentos, cancele cobranças e
                  processe reembolsos.
                </p>

                <span className="mt-5 inline-block text-sm font-semibold text-blue-600 group-hover:underline">
                  Abrir faturas →
                </span>
              </button>
            </section>
          </>
        )}
      </div>
    </main>
  );
}