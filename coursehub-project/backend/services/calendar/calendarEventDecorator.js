/**
 * Transforma o DTO básico (produzido pelos adapters) num DTO
 * enriquecido, pronto para o frontend. Função pura: sem consulta ao
 * banco, sem verificação de autorização, sem criação/edição de
 * entidades — isso é responsabilidade dos adapters e dos services de
 * escrita.
 *
 * Estruturado internamente em funções privadas por responsabilidade
 * (decoratePriority/decorateLabels/decorateActions/decorateFlags)
 * para que, se o arquivo crescer, cada uma possa virar seu próprio
 * módulo sem reescrever o restante. Não extrair agora — é
 * complexidade prematura para a v1.
 */

function addDays(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function decoratePriority(basicDto, { role, userContext, today }) {
  const { sourceType, eventGroup, indicatorType, startDate, status } = basicDto;

  if (status === "cancelled") return 4;

  if (eventGroup === "learning") {
    if (role === "teacher") {
      if (Number(userContext?.pendingReviews) > 0) return 1;
      if (startDate <= today) return 2;
      return 3;
    }

    // aluno (e admin, por padrão conservador)
    const submitted = Boolean(userContext?.submitted);

    if (startDate <= today && !submitted) return 1;
    if (startDate <= addDays(today, 3) && !submitted) return 2;
    return 3;
  }

  if (sourceType === "class_session") return 3;

  if (sourceType === "academic_event") {
    if (indicatorType === "enrollment" || indicatorType === "re_enrollment") {
      return startDate <= addDays(today, 3) ? 2 : 3;
    }

    if (role === "admin") {
      return startDate <= addDays(today, 3) ? 2 : 3;
    }

    return 4;
  }

  return 3;
}

function decorateLabels(basicDto, { role, userContext }) {
  const { sourceType, status, className, courseName, startTime } = basicDto;

  let statusText = "Ativa";

  if (status === "cancelled") {
    statusText = "Cancelada";
  } else if (sourceType === "activity" && role === "student") {
    if (userContext?.graded) statusText = "Corrigida";
    else if (userContext?.submitted) statusText = "Entregue";
    else statusText = "Pendente";
  } else if (sourceType === "activity" && role === "teacher") {
    const pending = Number(userContext?.pendingReviews) || 0;
    statusText = pending > 0 ? `${pending} aguardando correção` : "Sem pendências";
  }

  const subtitleParts = [];

  if (className) subtitleParts.push(className);
  else if (courseName) subtitleParts.push(courseName);

  if (startTime) subtitleParts.push(startTime);

  return {
    statusText,
    displaySubtitle: subtitleParts.length > 0 ? subtitleParts.join(" · ") : null,
  };
}

function decorateActions(basicDto, { role, userContext }) {
  const { sourceType, indicatorType, deepLink, status, classId, sourceId } = basicDto;

  // Encontro (class_session): "Gerenciar encontro" aponta pra
  // Encontros (professor ou admin, conforme o papel de quem está
  // olhando o calendário) -- não depende de deepLink (que hoje só
  // existe pro professor, ver classSessionCalendarAdapter.js), por
  // isso é resolvido aqui direto a partir de classId/sourceId, antes
  // do corte "sem deepLink, sem ação" que vale pros outros tipos.
  if (sourceType === "class_session") {
    const actions = [];

    if (role === "teacher" && deepLink) {
      actions.push({ type: "navigate", label: "Abrir turma", target: deepLink, disabled: false, reason: null });
    }

    if (role === "teacher") {
      actions.push({
        type: "navigate",
        label: "Gerenciar encontro",
        target: `/professor/encontros?classId=${classId}&sessionId=${sourceId}`,
        disabled: false,
        reason: null,
      });
    } else if (role === "admin") {
      actions.push({
        type: "navigate",
        label: "Gerenciar encontro",
        target: `/admin/encontros?classId=${classId}&sessionId=${sourceId}`,
        disabled: false,
        reason: null,
      });
    }

    return actions;
  }

  if (sourceType === "academic_event") {
    if (role !== "admin") return [];

    const actions = [
      { type: "edit", label: "Editar evento", target: null, disabled: false, reason: null },
    ];

    if (status === "active") {
      actions.push({
        type: "cancel",
        label: "Cancelar evento",
        target: null,
        disabled: false,
        reason: null,
      });
    }

    return actions;
  }

  if (!deepLink) return [];

  if (sourceType === "activity") {
    if (role === "student") {
      const graded = Boolean(userContext?.graded);
      const gradeAvailable = Boolean(userContext?.gradeAvailable);

      const label = graded
        ? "Ver resultado"
        : indicatorType === "exam"
          ? "Acessar avaliação"
          : "Acessar atividade";

      const disabled = graded && !gradeAvailable;

      return [
        {
          type: "navigate",
          label,
          target: deepLink,
          disabled,
          reason: disabled ? "A correção ainda não foi publicada." : null,
        },
      ];
    }

    if (role === "teacher") {
      const pending = Number(userContext?.pendingReviews) || 0;

      return [
        {
          type: "navigate",
          label: pending > 0 ? "Corrigir submissões" : "Ver atividade",
          target: deepLink,
          disabled: false,
          reason: null,
        },
      ];
    }

    return [{ type: "navigate", label: "Ver atividade", target: deepLink, disabled: false, reason: null }];
  }

  if (sourceType === "course_content") {
    return [
      { type: "navigate", label: "Abrir material", target: deepLink, disabled: false, reason: null },
    ];
  }

  return [];
}

function decorateFlags(basicDto, { role }) {
  if (basicDto.sourceType === "academic_event" && role === "admin") {
    return {
      editableFromCalendar: true,
      cancellableFromCalendar: basicDto.status === "active",
    };
  }

  return { editableFromCalendar: false, cancellableFromCalendar: false };
}

/**
 * Ponto de entrada único do decorator.
 */
function decorateCalendarEvent(basicDto, { role, userContext = {}, today }) {
  return {
    ...basicDto,

    displayPriority: decoratePriority(basicDto, { role, userContext, today }),
    ...decorateLabels(basicDto, { role, userContext }),
    actions: decorateActions(basicDto, { role, userContext }),
    ...decorateFlags(basicDto, { role }),

    userContext,
  };
}

module.exports = { decorateCalendarEvent };
