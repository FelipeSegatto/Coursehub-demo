const SIZE_CLASSES = {
  md: "px-3 py-1 text-xs",
  sm: "px-2 py-0.5 text-[11px]",
};

function StatusBadge({
  status,
  activeLabel = "Ativo",
  size = "md",
}) {
  const statusMap = {
    active: {
      text: activeLabel,
      className: "bg-green-100 text-green-700",
    },

    inactive: {
      text: "Inativo",
      className: "bg-red-100 text-red-700",
    },

    blocked: {
      text: "Bloqueado",
      className: "bg-red-100 text-red-700",
    },

    draft: {
      text: "Rascunho",
      className: "bg-yellow-100 text-yellow-700",
    },

    archived: {
      text: "Arquivado",
      className: "bg-gray-100 text-gray-700",
    },

    pending: {
      text: "Pendente",
      className: "bg-yellow-100 text-yellow-700",
    },

    pending_payment: {
      text: "Aguardando pagamento",
      className: "bg-yellow-100 text-yellow-700",
    },

    pending_activation: {
      text: "Aguardando ativação",
      className: "bg-yellow-100 text-yellow-700",
    },

    overdue: {
      text: "Atrasada",
      className: "bg-red-100 text-red-700",
    },

    submitted: {
      text: "Entregue",
      className: "bg-blue-100 text-blue-700",
    },

    pending_review: {
      text: "Aguardando correção",
      className: "bg-blue-100 text-blue-700",
    },

    graded: {
      text: "Corrigida",
      className: "bg-green-100 text-green-700",
    },

    returned: {
      text: "Devolvida",
      className: "bg-orange-100 text-orange-700",
    },

    completed: {
      text: "Concluído",
      className: "bg-green-100 text-green-700",
      },

    finished: {
      text: "Finalizada",
      className: "bg-gray-100 text-gray-700",
      },

    cancelled: {
      text: "Cancelada",
      className: "bg-red-100 text-red-700",
      },

    withdrawn: {
      text: "Desistente",
      className: "bg-red-100 text-red-700",
      },

    locked: {
      text: "Bloqueada",
      className: "bg-orange-100 text-orange-700",
      },

    not_started: {
      text: "Não iniciado",
      className:
        "bg-gray-100 text-gray-700",
      },

    in_progress: {
      text: "Em andamento",
      className:
        "bg-blue-100 text-blue-700",
      },

    new: {
      text: "Novo",
      className: "bg-blue-100 text-blue-700",
    },

    read: {
      text: "Lido",
      className: "bg-gray-100 text-gray-700",
    },

    resolved: {
      text: "Resolvido",
      className: "bg-green-100 text-green-700",
    },

    present: {
      text: "Presente",
      className: "bg-green-100 text-green-700",
    },

    absent: {
      text: "Ausente",
      className: "bg-red-100 text-red-700",
    },

    late: {
      text: "Atrasado",
      className: "bg-amber-100 text-amber-700",
    },

    excused: {
      text: "Justificado",
      className: "bg-blue-100 text-blue-700",
    },
    };

  const badge =
    statusMap[status] || {
      text: status || "Sem status",
      className: "bg-gray-100 text-gray-700",
    };

  return (
    <span
      className={`rounded-full font-semibold ${SIZE_CLASSES[size] || SIZE_CLASSES.md} ${badge.className}`}
    >
      {badge.text}
    </span>
  );
}

export default StatusBadge;