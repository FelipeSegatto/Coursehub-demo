import { useEffect, useState } from "react";

const MONTHS = [
  ["01", "Janeiro"],
  ["02", "Fevereiro"],
  ["03", "Março"],
  ["04", "Abril"],
  ["05", "Maio"],
  ["06", "Junho"],
  ["07", "Julho"],
  ["08", "Agosto"],
  ["09", "Setembro"],
  ["10", "Outubro"],
  ["11", "Novembro"],
  ["12", "Dezembro"],
];

const selectClassName =
  "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-[15px] text-slate-950 outline-none transition hover:border-slate-400 focus:border-slate-950 focus:ring-4 focus:ring-slate-950/10";

function daysInMonth(year, month) {
  if (!month) return 31;

  const numericYear = Number(year) || 2000;
  return new Date(numericYear, Number(month), 0).getDate();
}

function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");

  if (!match) {
    return { year: "", month: "", day: "" };
  }

  return { year: match[1], month: match[2], day: match[3] };
}

/**
 * Nascimento em três listas. O calendário nativo exige avançar mês
 * a mês até o ano certo; aqui a pessoa escolhe dia, mês e ano direto.
 * O valor entregue continua AAAA-MM-DD.
 */
export default function BirthDateFields({ value, onChange }) {
  const parsed = parseDate(value);
  const [year, setYear] = useState(parsed.year);
  const [month, setMonth] = useState(parsed.month);
  const [day, setDay] = useState(parsed.day);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1919 }, (_, index) => String(currentYear - index));
  const dayCount = daysInMonth(year, month);

  useEffect(() => {
    const next = parseDate(value);

    if (!next.year) return;

    setYear(next.year);
    setMonth(next.month);
    setDay(next.day);
  }, [value]);

  function commit(nextYear, nextMonth, nextDay) {
    const safeDay =
      nextDay && nextMonth
        ? String(Math.min(Number(nextDay), daysInMonth(nextYear, nextMonth))).padStart(2, "0")
        : nextDay;

    setYear(nextYear);
    setMonth(nextMonth);
    setDay(safeDay);

    if (nextYear && nextMonth && safeDay) {
      onChange(`${nextYear}-${nextMonth}-${safeDay}`);
      return;
    }

    onChange("");
  }

  return (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-medium text-slate-700">Data de nascimento</legend>
      <div className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)_minmax(0,0.9fr)] gap-2">
        <select
          aria-label="Dia"
          value={day}
          onChange={(event) => commit(year, month, event.target.value)}
          className={selectClassName}
        >
          <option value="">Dia</option>
          {Array.from({ length: dayCount }, (_, index) => {
            const option = String(index + 1).padStart(2, "0");
            return (
              <option key={option} value={option}>
                {index + 1}
              </option>
            );
          })}
        </select>

        <select
          aria-label="Mês"
          value={month}
          onChange={(event) => commit(year, event.target.value, day)}
          className={selectClassName}
        >
          <option value="">Mês</option>
          {MONTHS.map(([option, label]) => (
            <option key={option} value={option}>
              {label}
            </option>
          ))}
        </select>

        <select
          aria-label="Ano"
          value={year}
          onChange={(event) => commit(event.target.value, month, day)}
          className={selectClassName}
        >
          <option value="">Ano</option>
          {years.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}
