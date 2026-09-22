import "./financialBadges.css";

const CONTRACT_STATUS_CONFIG = {
  active: {
    label: "Ativo",
    className: "status-badge status-badge--success",
  },

  completed: {
    label: "Concluído",
    className: "status-badge status-badge--neutral",
  },

  cancelled: {
    label: "Cancelado",
    className: "status-badge status-badge--danger",
  },

  overdue: {
    label: "Em atraso",
    className: "status-badge status-badge--warning",
  },
};

export default function ContractStatusBadge({
  status,
  className = "",
}) {
  const config =
    CONTRACT_STATUS_CONFIG[status] || {
      label: status || "Desconhecido",
      className: "status-badge status-badge--default",
    };

  return (
    <span
      className={`${config.className} ${className}`.trim()}
    >
      {config.label}
    </span>
  );
}