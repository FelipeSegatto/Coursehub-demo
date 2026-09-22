import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { formatMonthLabel } from "../../utils/dateUtils";
import { getMacroFilters } from "./calendarDisplayConfig";

export default function CalendarToolbar({
  role,
  year,
  month,
  onPrevMonth,
  onNextMonth,
  onToday,
  macroFilterKey,
  onMacroFilterChange,
  onCreateClick,
  onCreateSession,
}) {
  const macroFilters = getMacroFilters(role);
  const monthLabel = formatMonthLabel(year, month);

  return (
    <div className="flex flex-col gap-4 border-b border-gray-100 pb-5 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 rounded-xl border border-gray-200 p-1">
          <button
            type="button"
            onClick={onPrevMonth}
            aria-label="Mês anterior"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100"
          >
            <ChevronLeft size={18} />
          </button>

          <button
            type="button"
            onClick={onToday}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
          >
            Hoje
          </button>

          <button
            type="button"
            onClick={onNextMonth}
            aria-label="Próximo mês"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <h2 className="text-lg font-bold capitalize text-gray-900">
          {monthLabel}
        </h2>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2">
          {macroFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => onMacroFilterChange(filter.key)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                macroFilterKey === filter.key
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {(role === "admin" || role === "teacher") && onCreateSession && (
          <button
            type="button"
            onClick={onCreateSession}
            className="flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
          >
            <Plus size={16} />
            Novo encontro
          </button>
        )}

        {role === "admin" && (
          <button
            type="button"
            onClick={onCreateClick}
            className="flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <Plus size={16} />
            Novo evento
          </button>
        )}
      </div>
    </div>
  );
}
