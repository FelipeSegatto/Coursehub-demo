const { formatDateOnly } = require("../../utils/appConfig");

const { getActivityCalendarEvents } = require("./adapters/activityCalendarAdapter");
const {
  getCourseContentCalendarEvents,
} = require("./adapters/courseContentCalendarAdapter");
const {
  getClassSessionCalendarEvents,
} = require("./adapters/classSessionCalendarAdapter");
const {
  getAcademicEventCalendarEvents,
} = require("./adapters/academicEventCalendarAdapter");

const { getUserContextForEvents } = require("./calendarUserContextService");
const { decorateCalendarEvent } = require("./calendarEventDecorator");

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function createServiceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
}

function validateRange(from, to) {
  if (!from || !to || !DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) {
    throw createServiceError(
      "Informe o período da consulta (from/to no formato YYYY-MM-DD).",
      400
    );
  }

  if (from > to) {
    throw createServiceError(
      "A data inicial do período não pode ser depois da data final.",
      400
    );
  }
}

/**
 * Ordena por data, depois prioridade visual, depois horário
 * (eventos sem horário por último), depois título.
 */
function compareEvents(a, b) {
  if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
  if (a.displayPriority !== b.displayPriority)
    return a.displayPriority - b.displayPriority;

  if (a.startTime !== b.startTime) {
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return a.startTime < b.startTime ? -1 : 1;
  }

  return a.title.localeCompare(b.title, "pt-BR");
}

/**
 * Deduplica por id normalizado. Colisão real só deveria acontecer
 * por bug de JOIN num adapter — nunca esconde silenciosamente,
 * registra um warning apontando a causa a ser corrigida na origem.
 */
function deduplicate(events) {
  const seen = new Set();
  const result = [];

  for (const event of events) {
    if (seen.has(event.id)) {
      console.warn(
        `[calendarAggregationService] evento duplicado ignorado: ${event.id} (sourceType=${event.sourceType}) — investigar o adapter dessa fonte.`
      );
      continue;
    }

    seen.add(event.id);
    result.push(event);
  }

  return result;
}

/**
 * Calculado inteiramente sobre o array de eventos já carregado e já
 * decorado — nenhuma consulta adicional ao banco.
 */
function calculateCounts(events, today) {
  const counts = {
    total: events.length,
    today: 0,
    upcoming: 0,
    overdue: 0,
    byGroup: {},
    byIndicatorType: {},
  };

  for (const event of events) {
    if (event.startDate === today) counts.today += 1;
    else if (event.startDate > today) counts.upcoming += 1;
    else if (event.eventGroup === "learning") counts.overdue += 1;

    counts.byGroup[event.eventGroup] = (counts.byGroup[event.eventGroup] || 0) + 1;
    counts.byIndicatorType[event.indicatorType] =
      (counts.byIndicatorType[event.indicatorType] || 0) + 1;
  }

  return counts;
}

/**
 * Ponto único de agregação, chamado pelos três services de calendar
 * (student/teacher/admin). Busca só o intervalo pedido, aplica
 * autorização (delegada aos adapters), evita N+1, deduplica, ordena
 * e calcula counts.
 */
async function aggregateCalendarEvents(db, { role, userId, from, to, filters }) {
  validateRange(from, to);

  const [activityEvents, courseContentEvents, classSessionEvents, academicEvents] =
    await Promise.all([
      getActivityCalendarEvents(db, { role, userId, from, to, filters }),
      getCourseContentCalendarEvents(db, { role, userId, from, to, filters }),
      getClassSessionCalendarEvents(db, { role, userId, from, to, filters }),
      getAcademicEventCalendarEvents(db, { role, userId, from, to, filters }),
    ]);

  const basicEvents = deduplicate([
    ...activityEvents,
    ...courseContentEvents,
    ...classSessionEvents,
    ...academicEvents,
  ]);

  const userContextByEventId = await getUserContextForEvents(db, {
    role,
    userId,
    basicEvents,
  });

  const today = formatDateOnly(new Date());

  const decoratedEvents = basicEvents
    .map((event) =>
      decorateCalendarEvent(event, {
        role,
        userContext: userContextByEventId.get(event.id) || {},
        today,
      })
    )
    .sort(compareEvents);

  const counts = calculateCounts(decoratedEvents, today);

  return { events: decoratedEvents, counts };
}

module.exports = { aggregateCalendarEvents };
