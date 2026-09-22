/**
 * Vocabulário visual compartilhado pelos componentes do calendário —
 * cores/labels não vêm do backend (o DTO não conhece apresentação),
 * só os identificadores (eventGroup/indicatorType) usados aqui como
 * chave.
 */

export const EVENT_GROUP_CONFIG = {
  learning: {
    label: "Estudos e entregas",
    dot: "bg-blue-500",
    badge: "bg-blue-100 text-blue-700",
  },
  class: {
    label: "Aulas",
    dot: "bg-purple-500",
    badge: "bg-purple-100 text-purple-700",
  },
  academic: {
    label: "Acadêmico",
    dot: "bg-amber-500",
    badge: "bg-amber-100 text-amber-700",
  },
  institutional: {
    label: "Institucional",
    dot: "bg-teal-500",
    badge: "bg-teal-100 text-teal-700",
  },
  administrative: {
    label: "Administrativo",
    dot: "bg-slate-500",
    badge: "bg-slate-100 text-slate-700",
  },
};

export function getEventGroupConfig(eventGroup) {
  return (
    EVENT_GROUP_CONFIG[eventGroup] || {
      label: eventGroup || "Outro",
      dot: "bg-gray-400",
      badge: "bg-gray-100 text-gray-700",
    }
  );
}

export const INDICATOR_TYPE_LABELS = {
  activity: "Atividade",
  exam: "Avaliação",
  course_content: "Conteúdo",
  class: "Aula",
  holiday: "Feriado",
  break: "Férias",
  recess: "Recesso",
  exam_week: "Semana de provas",
  academic_week: "Semana acadêmica",
  enrollment: "Matrícula",
  re_enrollment: "Rematrícula",
  grade_deadline: "Prazo acadêmico",
  academic_meeting: "Reunião",
  institutional: "Evento institucional",
};

export function getIndicatorTypeLabel(indicatorType) {
  return INDICATOR_TYPE_LABELS[indicatorType] || indicatorType;
}

export const PRIORITY_BORDER_ACCENT = {
  1: "border-l-4 border-l-red-500",
  2: "border-l-4 border-l-orange-400",
  3: "border-l-4 border-l-gray-200",
  4: "border-l-4 border-l-gray-200",
};

export function getPriorityAccent(priority) {
  return PRIORITY_BORDER_ACCENT[priority] || PRIORITY_BORDER_ACCENT[3];
}

/**
 * Filtros macro por role (primeiro nível). "match" opera sobre o
 * evento já decorado — nunca faz nova chamada ao backend.
 */
export function getMacroFilters(role) {
  if (role === "student") {
    return [
      { key: "all", label: "Todos", match: () => true },
      {
        key: "learning",
        label: "Estudos e entregas",
        match: (event) => event.eventGroup === "learning",
      },
      {
        key: "class",
        label: "Aulas",
        match: (event) => event.eventGroup === "class",
      },
      {
        key: "academic",
        label: "Eventos acadêmicos",
        match: (event) =>
          event.eventGroup === "academic" || event.eventGroup === "institutional",
      },
    ];
  }

  if (role === "teacher") {
    return [
      { key: "all", label: "Todos", match: () => true },
      {
        key: "learning",
        label: "Ensino e avaliações",
        match: (event) => event.eventGroup === "learning",
      },
      {
        key: "pending",
        label: "Correções e pendências",
        match: (event) => Number(event.userContext?.pendingReviews) > 0,
      },
      {
        key: "class",
        label: "Aulas",
        match: (event) => event.eventGroup === "class",
      },
      {
        key: "academic",
        label: "Eventos acadêmicos",
        match: (event) =>
          event.eventGroup === "academic" || event.eventGroup === "institutional",
      },
    ];
  }

  // admin
  return [
    { key: "all", label: "Todos", match: () => true },
    {
      key: "academic",
      label: "Acadêmico",
      match: (event) => event.eventGroup === "academic",
    },
    {
      key: "institutional",
      label: "Institucional",
      match: (event) => event.eventGroup === "institutional",
    },
    {
      key: "administrative",
      label: "Administrativo",
      match: (event) => event.eventGroup === "administrative",
    },
  ];
}
