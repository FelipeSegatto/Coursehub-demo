const { aggregateCalendarEvents } = require("./calendarAggregationService");

/**
 * Orquestra apenas a consulta do calendário do aluno autenticado.
 * Não escreve dados — delega toda a agregação/autorização para
 * calendarAggregationService (que por sua vez delega escopo pra cada
 * adapter).
 */
async function getStudentCalendar(db, { userId, from, to }) {
  return aggregateCalendarEvents(db, { role: "student", userId, from, to });
}

module.exports = { getStudentCalendar };
