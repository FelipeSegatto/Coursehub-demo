function formatCurrency(value) {
  const number = Number(value);

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(number) ? number : 0);
}

const CARD_CONFIG = {
  totalContracted: {
    label: "Total contratado",
    description: "Valor total dos contratos",
    valueClassName: "text-slate-900",
  },

  totalReceived: {
    label: "Total recebido",
    description: "Pagamentos confirmados",
    valueClassName: "text-emerald-700",
  },

  totalPending: {
    label: "Total pendente",
    description: "Valores ainda não recebidos",
    valueClassName: "text-amber-700",
  },

  totalOverdue: {
    label: "Total em atraso",
    description: "Faturas vencidas",
    valueClassName: "text-red-700",
  },
};

export default function FinancialSummaryCards({
  summary,
}) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Object.entries(CARD_CONFIG).map(
        ([key, config]) => (
          <article
            key={key}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm font-medium text-slate-500">
              {config.label}
            </p>

            <p
              className={[
                "mt-2 text-2xl font-semibold",
                "tracking-tight",
                config.valueClassName,
              ].join(" ")}
            >
              {formatCurrency(
                summary?.[key] ?? 0
              )}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {config.description}
            </p>
          </article>
        )
      )}
    </section>
  );
}