/**
 * Única fonte de configuração de fuso horário da aplicação. Todo
 * módulo que formata data/hora para exibição (hoje, principalmente
 * o academic-calendar) deve importar TIMEZONE daqui em vez de
 * hardcodar a string em vários lugares.
 *
 * "America/Sao_Paulo" é o identificador IANA correto para o horário
 * de Brasília — não existe "America/Brasilia" na tzdata.
 */
const TIMEZONE = "America/Sao_Paulo";

/**
 * Formata uma coluna DATE/DATETIME do MySQL como "YYYY-MM-DD".
 *
 * mysql2 devolve essas colunas como um objeto Date construído no
 * fuso LOCAL do processo Node (não em UTC) — por isso lemos com
 * getFullYear/getMonth/getDate (getters locais), nunca
 * toISOString(), que corta pelo horário UTC e pode devolver o dia
 * anterior dependendo do fuso do servidor.
 */
function formatDateOnly(value) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Formata uma coluna TIME do MySQL ("09:00:00", já string) como
 * "HH:mm". Colunas TIME não sofrem o problema de fuso do DATE —
 * mysql2 já devolve como string simples.
 */
function formatTimeOnly(value) {
  if (!value) return null;

  return String(value).slice(0, 5);
}

/**
 * True when two DATETIME-ish values represent a different instant.
 * Handles the three shapes this app actually compares: a JS Date
 * from mysql2 (already local-time-based), a full "YYYY-MM-DD HH:mm:ss"
 * string, and a bare "YYYY-MM-DD" string from an <input type="date">.
 *
 * The bare-date case needs care: per the ECMA-262 Date Time String
 * Format, "2026-09-01" alone parses as UTC midnight, but
 * "2026-09-01 00:00:00" (space-separated, not "T") parses as LOCAL
 * midnight in every JS engine -- the same local interpretation
 * mysql2 uses when it reads the DATETIME column back. Comparing a
 * bare date string against a DB-sourced Date without this padding
 * silently drifts by the server's UTC offset and reports a "change"
 * for a value that's actually identical (confirmed by a real test
 * failure: re-saving the same due date on a course_contents row
 * falsely fired learning.content.changed).
 */
function toComparableTime(value) {
  if (!value) return null;

  if (value instanceof Date) return value.getTime();

  const stringValue = String(value);
  const isBareDate = /^\d{4}-\d{2}-\d{2}$/.test(stringValue);

  return new Date(isBareDate ? `${stringValue} 00:00:00` : stringValue).getTime();
}

function datesRepresentSameInstant(previousValue, nextValue) {
  return toComparableTime(previousValue) === toComparableTime(nextValue);
}

module.exports = { TIMEZONE, formatDateOnly, formatTimeOnly, datesRepresentSameInstant };
