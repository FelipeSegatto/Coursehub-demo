const { aggregateCalendarEvents } = require("./calendarAggregationService");

/**
 * Mesmo padrão de studentCalendarService, para o professor
 * autenticado. Não escreve dados.
 */
async function getTeacherCalendar(db, { userId, from, to }) {
  return aggregateCalendarEvents(db, { role: "teacher", userId, from, to });
}

module.exports = { getTeacherCalendar };
