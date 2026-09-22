import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import {
  listFinancialInvoices,
} from "../../../services/FinancialService";

import FinancialInvoicesTable from "../../../components/financial/FinancialInvoicesTable";
import ExportPdfButton from "../../../components/reports/ExportPdfButton";
import MobileFilterToggle from "../../../components/ui/MobileFilterToggle";

const INITIAL_PAGINATION = {
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 0,
};

function extractResponseData(response) {
  return response?.data ?? response ?? {};
}

function normalizeInvoicesResponse(
  response,
  currentPage,
  currentLimit
) {
  const result =
    extractResponseData(response);

  const invoices =
    result.invoices ??
    result.items ??
    result.results ??
    [];

  return {
    invoices: Array.isArray(invoices)
      ? invoices
      : [],

    pagination: {
      page:
        Number(result.pagination?.page) ||
        currentPage,

      limit:
        Number(result.pagination?.limit) ||
        currentLimit,

      total:
        Number(result.pagination?.total) ||
        0,

      totalPages:
        Number(
          result.pagination?.totalPages ??
            result.pagination?.total_pages
        ) || 0,
    },
  };
}

function getErrorMessage(error) {
  return (
    error?.message ||
    "Não foi possível carregar as faturas financeiras."
  );
}

function createInitialFilters(
  searchParams
) {
  return {
    search:
      searchParams.get("search") || "",

    status:
      searchParams.get("status") || "",

    contractId:
      searchParams.get("contractId") ||
      "",

    dueDateFrom:
      searchParams.get("dueDateFrom") ||
      "",

    dueDateTo:
      searchParams.get("dueDateTo") ||
      "",

    overdueOnly:
      searchParams.get("overdueOnly") ===
      "true",
  };
}

function SummaryCard({
  label,
  value,
  description,
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">
        {label}
      </p>

      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
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

function LoadingState() {
  return (
    <div
      className="flex min-h-80 flex-col items-center justify-center gap-4 px-6 py-12"
      aria-live="polite"
    >
      <span
        aria-hidden="true"
        className={[
          "h-9 w-9 animate-spin",
          "rounded-full border-4",
          "border-blue-100",
          "border-t-blue-600",
        ].join(" ")}
      />

      <p className="text-sm font-medium text-slate-500">
        Carregando faturas financeiras...
      </p>
    </div>
  );
}

function EmptyState({
  hasActiveFilters,
  onClearFilters,
}) {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-xl font-bold text-blue-600">
        $
      </div>

      <h2 className="mt-5 text-lg font-semibold text-slate-900">
        Nenhuma fatura encontrada
      </h2>

      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
        Não existem faturas que correspondam
        aos filtros selecionados.
      </p>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className={[
            "mt-5 inline-flex min-h-10",
            "items-center justify-center",
            "rounded-lg bg-blue-600 px-4",
            "text-sm font-semibold text-white",
            "transition hover:bg-blue-700",
            "focus:outline-none focus:ring-2",
            "focus:ring-blue-500",
            "focus:ring-offset-2",
          ].join(" ")}
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}

export default function FinancialInvoicesAdmin() {
  const navigate = useNavigate();

  const [searchParams, setSearchParams] =
    useSearchParams();

  const [invoices, setInvoices] =
    useState([]);

  const [pagination, setPagination] =
    useState(INITIAL_PAGINATION);

  const [filters, setFilters] = useState(
    () => createInitialFilters(searchParams)
  );

  const [page, setPage] = useState(() => {
    const pageFromUrl = Number(
      searchParams.get("page")
    );

    return Number.isInteger(pageFromUrl) &&
      pageFromUrl > 0
      ? pageFromUrl
      : 1;
  });

  const [limit, setLimit] = useState(() => {
    const limitFromUrl = Number(
      searchParams.get("limit")
    );

    return [10, 20, 50, 100].includes(
      limitFromUrl
    )
      ? limitFromUrl
      : 20;
  });

  const [
    debouncedSearch,
    setDebouncedSearch,
  ] = useState(
    searchParams.get("search") || ""
  );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [reloadKey, setReloadKey] =
    useState(0);

  useEffect(() => {
    const timeoutId =
      window.setTimeout(() => {
        setDebouncedSearch(
          filters.search.trim()
        );

        setPage(1);
      }, 400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [filters.search]);

  useEffect(() => {
    const nextParams =
      new URLSearchParams();

    if (debouncedSearch) {
      nextParams.set(
        "search",
        debouncedSearch
      );
    }

    if (filters.status) {
      nextParams.set(
        "status",
        filters.status
      );
    }

    if (filters.contractId) {
      nextParams.set(
        "contractId",
        filters.contractId
      );
    }

    if (filters.dueDateFrom) {
      nextParams.set(
        "dueDateFrom",
        filters.dueDateFrom
      );
    }

    if (filters.dueDateTo) {
      nextParams.set(
        "dueDateTo",
        filters.dueDateTo
      );
    }

    if (filters.overdueOnly) {
      nextParams.set(
        "overdueOnly",
        "true"
      );
    }

    if (page > 1) {
      nextParams.set(
        "page",
        String(page)
      );
    }

    if (limit !== 20) {
      nextParams.set(
        "limit",
        String(limit)
      );
    }

    setSearchParams(nextParams, {
      replace: true,
    });
  }, [
    debouncedSearch,
    filters.status,
    filters.contractId,
    filters.dueDateFrom,
    filters.dueDateTo,
    filters.overdueOnly,
    page,
    limit,
    setSearchParams,
  ]);

  const loadInvoices = useCallback(
    async (signal) => {
      try {
        setLoading(true);
        setError("");

        const response =
          await listFinancialInvoices({
            page,
            limit,

            search:
              debouncedSearch ||
              undefined,

            status:
              filters.status ||
              undefined,

            contractId:
              filters.contractId ||
              undefined,

            dueDateFrom:
              filters.dueDateFrom ||
              undefined,

            dueDateTo:
              filters.dueDateTo ||
              undefined,

            overdueOnly:
              filters.overdueOnly
                ? true
                : undefined,
          });

        if (signal.aborted) {
          return;
        }

        const normalized =
          normalizeInvoicesResponse(
            response,
            page,
            limit
          );

        setInvoices(
          normalized.invoices
        );

        setPagination(
          normalized.pagination
        );
      } catch (requestError) {
        if (signal.aborted) {
          return;
        }

        setInvoices([]);
        setError(
          getErrorMessage(requestError)
        );
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },
    [
      page,
      limit,
      debouncedSearch,
      filters.status,
      filters.contractId,
      filters.dueDateFrom,
      filters.dueDateTo,
      filters.overdueOnly,
    ]
  );

  useEffect(() => {
    const controller =
      new AbortController();

    loadInvoices(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadInvoices, reloadKey]);

  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        filters.search.trim() ||
          filters.status ||
          filters.contractId ||
          filters.dueDateFrom ||
          filters.dueDateTo ||
          filters.overdueOnly
      ),
    [
      filters.search,
      filters.status,
      filters.contractId,
      filters.dueDateFrom,
      filters.dueDateTo,
      filters.overdueOnly,
    ]
  );

  const activeFilterCount = [
    filters.status,
    filters.contractId,
    filters.dueDateFrom,
    filters.dueDateTo,
    filters.overdueOnly,
  ].filter(Boolean).length;

  const firstVisibleItem =
    pagination.total === 0
      ? 0
      : (pagination.page - 1) *
          pagination.limit +
        1;

  const lastVisibleItem = Math.min(
    pagination.page *
      pagination.limit,
    pagination.total
  );

  function handleFilterChange(event) {
    const {
      name,
      value,
      type,
      checked,
    } = event.target;

    setFilters((currentFilters) => ({
      ...currentFilters,
      [name]:
        type === "checkbox"
          ? checked
          : value,
    }));

    if (name !== "search") {
      setPage(1);
    }
  }

  function handleLimitChange(event) {
    const nextLimit =
      Number(event.target.value) || 20;

    setLimit(nextLimit);
    setPage(1);
  }

  function clearFilters() {
    setFilters({
      search: "",
      status: "",
      contractId: "",
      dueDateFrom: "",
      dueDateTo: "",
      overdueOnly: false,
    });

    setDebouncedSearch("");
    setPage(1);
  }

  function retryRequest() {
    setReloadKey(
      (currentKey) =>
        currentKey + 1
    );
  }

  function openInvoice(invoiceId) {
    navigate(
      `/admin/financeiro/cobrancas/${invoiceId}`
    );
  }

  function openContract(contractId) {
    navigate(
      `/admin/financeiro/contratos/${contractId}`
    );
  }

  function goToPreviousPage() {
    setPage((currentPage) =>
      Math.max(currentPage - 1, 1)
    );
  }

  function goToNextPage() {
    setPage((currentPage) =>
      Math.min(
        currentPage + 1,
        pagination.totalPages
      )
    );
  }

  return (
    <main className="min-h-full w-full bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1600px]">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">
              Financeiro
            </span>

            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Faturas financeiras
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Consulte vencimentos, pagamentos,
              saldos pendentes e cobranças em
              atraso.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <ExportPdfButton
              basePath="/api/admin/reports/financial-invoices"
              filters={{
                status: filters.status,
                contractId: filters.contractId,
                dueFrom: filters.dueDateFrom,
                dueTo: filters.dueDateTo,
                search: debouncedSearch,
              }}
            />

            <button
              type="button"
              onClick={() =>
                navigate(
                  "/admin/financeiro/contratos"
                )
              }
              className={[
                "inline-flex min-h-10 items-center",
                "justify-center rounded-lg",
                "border border-slate-300",
                "bg-white px-4",
                "text-sm font-semibold",
                "text-slate-700 shadow-sm",
                "transition hover:bg-slate-50",
                "focus:outline-none",
                "focus:ring-2",
                "focus:ring-blue-500",
                "focus:ring-offset-2",
              ].join(" ")}
            >
              Ver contratos
            </button>

            <button
              type="button"
              onClick={() =>
                navigate(
                  "/admin/financeiro"
                )
              }
              className={[
                "inline-flex min-h-10 items-center",
                "justify-center rounded-lg",
                "border border-slate-300",
                "bg-white px-4",
                "text-sm font-semibold",
                "text-slate-700 shadow-sm",
                "transition hover:bg-slate-50",
                "focus:outline-none",
                "focus:ring-2",
                "focus:ring-blue-500",
                "focus:ring-offset-2",
              ].join(" ")}
            >
              Dashboard financeiro
            </button>
          </div>
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <SummaryCard
            label="Total encontrado"
            value={pagination.total}
            description="Faturas correspondentes aos filtros"
          />

          <SummaryCard
            label="Página atual"
            value={
              pagination.totalPages > 0
                ? `${pagination.page} de ${pagination.totalPages}`
                : "0 de 0"
            }
            description={`${pagination.limit} registros por página`}
          />

          <SummaryCard
            label="Exibindo"
            value={
              pagination.total > 0
                ? `${firstVisibleItem}–${lastVisibleItem}`
                : "0"
            }
            description="Intervalo atual de resultados"
          />
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <div>
              <label
                htmlFor="invoice-search"
                className="mb-1.5 block text-xs font-semibold text-slate-600"
              >
                Buscar
              </label>

              <input
                id="invoice-search"
                type="search"
                name="search"
                value={filters.search}
                onChange={
                  handleFilterChange
                }
                placeholder="Fatura, aluno, matrícula ou contrato"
                className={[
                  "min-h-11 w-full rounded-lg",
                  "border border-slate-300",
                  "bg-white px-3 text-sm",
                  "text-slate-900",
                  "placeholder:text-slate-400",
                  "transition",
                  "focus:border-blue-500",
                  "focus:outline-none",
                  "focus:ring-2",
                  "focus:ring-blue-500/20",
                ].join(" ")}
              />
            </div>

            <div className="mt-4">
            <MobileFilterToggle activeCount={activeFilterCount}>
            <div className="grid w-full gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <label
                  htmlFor="invoice-status"
                  className="mb-1.5 block text-xs font-semibold text-slate-600"
                >
                  Status
                </label>

                <select
                  id="invoice-status"
                  name="status"
                  value={filters.status}
                  onChange={
                    handleFilterChange
                  }
                  className={[
                    "min-h-11 w-full rounded-lg",
                    "border border-slate-300",
                    "bg-white px-3 text-sm",
                    "text-slate-900",
                    "transition",
                    "focus:border-blue-500",
                    "focus:outline-none",
                    "focus:ring-2",
                    "focus:ring-blue-500/20",
                  ].join(" ")}
                >
                  <option value="">
                    Todos os status
                  </option>

                  <option value="pending">
                    Pendente
                  </option>

                  <option value="processing">
                    Processando
                  </option>

                  <option value="paid">
                    Pago
                  </option>

                  <option value="overdue">
                    Vencido
                  </option>

                  <option value="cancelled">
                    Cancelado
                  </option>

                  <option value="refunded">
                    Reembolsado
                  </option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="invoice-contract-id"
                  className="mb-1.5 block text-xs font-semibold text-slate-600"
                >
                  Contrato
                </label>

                <input
                  id="invoice-contract-id"
                  type="number"
                  min="1"
                  step="1"
                  name="contractId"
                  value={
                    filters.contractId
                  }
                  onChange={
                    handleFilterChange
                  }
                  placeholder="ID do contrato"
                  className={[
                    "min-h-11 w-full rounded-lg",
                    "border border-slate-300",
                    "bg-white px-3 text-sm",
                    "text-slate-900",
                    "placeholder:text-slate-400",
                    "transition",
                    "focus:border-blue-500",
                    "focus:outline-none",
                    "focus:ring-2",
                    "focus:ring-blue-500/20",
                  ].join(" ")}
                />
              </div>

              <div>
                <label
                  htmlFor="invoice-due-date-from"
                  className="mb-1.5 block text-xs font-semibold text-slate-600"
                >
                  Vencimento inicial
                </label>

                <input
                  id="invoice-due-date-from"
                  type="date"
                  name="dueDateFrom"
                  value={
                    filters.dueDateFrom
                  }
                  onChange={
                    handleFilterChange
                  }
                  className={[
                    "min-h-11 w-full rounded-lg",
                    "border border-slate-300",
                    "bg-white px-3 text-sm",
                    "text-slate-900",
                    "transition",
                    "focus:border-blue-500",
                    "focus:outline-none",
                    "focus:ring-2",
                    "focus:ring-blue-500/20",
                  ].join(" ")}
                />
              </div>

              <div>
                <label
                  htmlFor="invoice-due-date-to"
                  className="mb-1.5 block text-xs font-semibold text-slate-600"
                >
                  Vencimento final
                </label>

                <input
                  id="invoice-due-date-to"
                  type="date"
                  name="dueDateTo"
                  value={filters.dueDateTo}
                  min={
                    filters.dueDateFrom ||
                    undefined
                  }
                  onChange={
                    handleFilterChange
                  }
                  className={[
                    "min-h-11 w-full rounded-lg",
                    "border border-slate-300",
                    "bg-white px-3 text-sm",
                    "text-slate-900",
                    "transition",
                    "focus:border-blue-500",
                    "focus:outline-none",
                    "focus:ring-2",
                    "focus:ring-blue-500/20",
                  ].join(" ")}
                />
              </div>

              <div>
                <label
                  htmlFor="invoice-limit"
                  className="mb-1.5 block text-xs font-semibold text-slate-600"
                >
                  Por página
                </label>

                <select
                  id="invoice-limit"
                  value={limit}
                  onChange={
                    handleLimitChange
                  }
                  className={[
                    "min-h-11 w-full rounded-lg",
                    "border border-slate-300",
                    "bg-white px-3 text-sm",
                    "text-slate-900",
                    "transition",
                    "focus:border-blue-500",
                    "focus:outline-none",
                    "focus:ring-2",
                    "focus:ring-blue-500/20",
                  ].join(" ")}
                >
                  <option value={10}>
                    10
                  </option>

                  <option value={20}>
                    20
                  </option>

                  <option value={50}>
                    50
                  </option>

                  <option value={100}>
                    100
                  </option>
                </select>
              </div>

              <div className="flex items-end">
                <label className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg border border-slate-300 bg-white px-3 transition hover:bg-slate-50">
                  <input
                    type="checkbox"
                    name="overdueOnly"
                    checked={
                      filters.overdueOnly
                    }
                    onChange={
                      handleFilterChange
                    }
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />

                  <span className="text-sm font-medium text-slate-700">
                    Apenas vencidas
                  </span>
                </label>
              </div>
            </div>
            </MobileFilterToggle>
            </div>

            {hasActiveFilters && (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-sm font-semibold text-blue-600 transition hover:text-blue-800 hover:underline"
                >
                  Limpar todos os filtros
                </button>
              </div>
            )}
          </div>

          {error && (
            <div className="m-4 flex flex-col gap-4 rounded-xl border border-red-200 bg-red-50 p-4 sm:m-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-red-800">
                  Erro ao carregar faturas
                </h2>

                <p className="mt-1 text-sm text-red-700">
                  {error}
                </p>
              </div>

              <button
                type="button"
                onClick={retryRequest}
                className={[
                  "inline-flex min-h-10",
                  "shrink-0 items-center",
                  "justify-center rounded-lg",
                  "border border-red-300",
                  "bg-white px-4",
                  "text-sm font-semibold",
                  "text-red-700 transition",
                  "hover:bg-red-100",
                  "focus:outline-none",
                  "focus:ring-2",
                  "focus:ring-red-500",
                  "focus:ring-offset-2",
                ].join(" ")}
              >
                Tentar novamente
              </button>
            </div>
          )}

          {loading ? (
            <LoadingState />
          ) : invoices.length === 0 ? (
            <EmptyState
              hasActiveFilters={
                hasActiveFilters
              }
              onClearFilters={
                clearFilters
              }
            />
          ) : (
            <>
              <FinancialInvoicesTable
                invoices={invoices}
                onOpenInvoice={
                  openInvoice
                }
                onOpenContract={
                  openContract
                }
              />

              <footer className="flex flex-col gap-4 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <p className="text-sm text-slate-500">
                  Mostrando{" "}
                  <strong className="font-semibold text-slate-700">
                    {firstVisibleItem}
                  </strong>{" "}
                  até{" "}
                  <strong className="font-semibold text-slate-700">
                    {lastVisibleItem}
                  </strong>{" "}
                  de{" "}
                  <strong className="font-semibold text-slate-700">
                    {pagination.total}
                  </strong>{" "}
                  faturas.
                </p>

                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <button
                    type="button"
                    onClick={
                      goToPreviousPage
                    }
                    disabled={
                      pagination.page <= 1
                    }
                    className={[
                      "inline-flex min-h-10",
                      "items-center justify-center",
                      "rounded-lg border",
                      "border-slate-300 bg-white",
                      "px-4 text-sm font-semibold",
                      "text-slate-700 transition",
                      "hover:bg-slate-50",
                      "disabled:cursor-not-allowed",
                      "disabled:opacity-40",
                      "focus:outline-none",
                      "focus:ring-2",
                      "focus:ring-blue-500",
                      "focus:ring-offset-2",
                    ].join(" ")}
                  >
                    Anterior
                  </button>

                  <span className="whitespace-nowrap text-sm text-slate-500">
                    Página{" "}
                    <strong className="font-semibold text-slate-700">
                      {pagination.page}
                    </strong>{" "}
                    de{" "}
                    <strong className="font-semibold text-slate-700">
                      {pagination.totalPages}
                    </strong>
                  </span>

                  <button
                    type="button"
                    onClick={goToNextPage}
                    disabled={
                      pagination.page >=
                      pagination.totalPages
                    }
                    className={[
                      "inline-flex min-h-10",
                      "items-center justify-center",
                      "rounded-lg border",
                      "border-slate-300 bg-white",
                      "px-4 text-sm font-semibold",
                      "text-slate-700 transition",
                      "hover:bg-slate-50",
                      "disabled:cursor-not-allowed",
                      "disabled:opacity-40",
                      "focus:outline-none",
                      "focus:ring-2",
                      "focus:ring-blue-500",
                      "focus:ring-offset-2",
                    ].join(" ")}
                  >
                    Próxima
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>
      </div>
    </main>
  );
}