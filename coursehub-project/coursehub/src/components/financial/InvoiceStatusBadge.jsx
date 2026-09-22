const INVOICE_STATUS_CONFIG = {
  pending: {
    label: "Pendente",
    classes:
      "border-amber-200 bg-amber-50 text-amber-700",
    dotClasses: "bg-amber-500",
  },

  processing: {
    label: "Processando",
    classes:
      "border-blue-200 bg-blue-50 text-blue-700",
    dotClasses: "bg-blue-500",
  },

  paid: {
    label: "Pago",
    classes:
      "border-emerald-200 bg-emerald-50 text-emerald-700",
    dotClasses: "bg-emerald-500",
  },

  overdue: {
    label: "Vencido",
    classes:
      "border-red-200 bg-red-50 text-red-700",
    dotClasses: "bg-red-500",
  },

  cancelled: {
    label: "Cancelado",
    classes:
      "border-slate-200 bg-slate-100 text-slate-700",
    dotClasses: "bg-slate-500",
  },

  refunded: {
    label: "Reembolsado",
    classes:
      "border-violet-200 bg-violet-50 text-violet-700",
    dotClasses: "bg-violet-500",
  },
};

export default function InvoiceStatusBadge({
  status,
  className = "",
}) {
  const config = INVOICE_STATUS_CONFIG[status] || {
    label: status || "Desconhecido",
    classes:
      "border-slate-200 bg-slate-50 text-slate-600",
    dotClasses: "bg-slate-400",
  };

  return (
    <span
      className={[
        "inline-flex items-center gap-1.5",
        "whitespace-nowrap rounded-full border",
        "px-2.5 py-1",
        "text-xs font-semibold",
        config.classes,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        aria-hidden="true"
        className={[
          "h-1.5 w-1.5 rounded-full",
          config.dotClasses,
        ].join(" ")}
      />

      {config.label}
    </span>
  );
}