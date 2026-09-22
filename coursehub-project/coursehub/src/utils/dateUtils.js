/**
 * Utilitários de data compartilhados pelo módulo de calendário.
 *
 * O padrão aqui replica o parsing defensivo que já existia (isolado)
 * em pages/teacher/TeacherAttendance.jsx: strings "YYYY-MM-DD"
 * nunca passam por `new Date(string)` diretamente — isso faz o
 * JavaScript interpretar como UTC meia-noite, que em fusos
 * negativos (Brasil) desloca a data pro dia anterior ao formatar.
 * Em vez disso, sempre quebramos a string manualmente e construímos
 * `new Date(year, month - 1, day)`, que usa o fuso local do
 * navegador — e formatamos de volta com os mesmos getters locais,
 * então o resultado é sempre autoconsistente, não importa o fuso da
 * máquina do usuário.
 */

export const TIMEZONE = "America/Sao_Paulo";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const MONTH_LABELS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/**
 * "YYYY-MM-DD" -> Date local (meia-noite no fuso do navegador).
 */
export function parseLocalDate(dateString) {
  if (!dateString) return null;

  const [year, month, day] = dateString.split("-").map(Number);

  return new Date(year, month - 1, day);
}

/**
 * Date -> "YYYY-MM-DD", usando getters locais (espelha
 * formatDateOnly do backend). Nunca usar toISOString() aqui.
 */
export function formatDateString(date) {
  if (!date) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function todayDateString() {
  return formatDateString(new Date());
}

export function addDaysToDateString(dateString, days) {
  const date = parseLocalDate(dateString);
  date.setDate(date.getDate() + days);

  return formatDateString(date);
}

/**
 * "YYYY-MM-DD" -> "20 de agosto de 2026" (ou variações via options).
 * Nunca passa `timeZone` para o Intl.DateTimeFormat aqui de
 * propósito — o Date já foi construído no fuso local do navegador a
 * partir dos mesmos componentes Y/M/D, então formatar sem forçar
 * outro fuso é o que mantém o dia exibido igual ao dia armazenado.
 */
export function formatDisplayDate(dateString, options) {
  const date = parseLocalDate(dateString);

  if (!date) return "";

  return new Intl.DateTimeFormat(
    "pt-BR",
    options || { day: "2-digit", month: "long", year: "numeric" }
  ).format(date);
}

export function formatMonthLabel(year, month) {
  return `${MONTH_LABELS[month]} de ${year}`;
}

export function getWeekdayLabels() {
  return WEEKDAY_LABELS;
}

/**
 * Monta a grade de 6 semanas (42 células) do mês, começando no
 * domingo anterior (ou igual) ao dia 1. Cada célula devolve a data
 * como string "YYYY-MM-DD" pra bater direto com startDate dos
 * eventos, mais um flag indicando se pertence ao mês corrente.
 */
export function getMonthGridDays(year, month) {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay(); // 0 = domingo

  const gridStart = new Date(year, month, 1 - startOffset);

  const days = [];

  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + i
    );

    days.push({
      dateString: formatDateString(cellDate),
      dayNumber: cellDate.getDate(),
      inCurrentMonth: cellDate.getMonth() === month,
    });
  }

  return days;
}

export function getMonthRangeBounds(year, month) {
  const days = getMonthGridDays(year, month);

  return { from: days[0].dateString, to: days[days.length - 1].dateString };
}
