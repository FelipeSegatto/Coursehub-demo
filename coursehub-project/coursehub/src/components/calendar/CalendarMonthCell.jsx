import { getEventGroupConfig } from "./calendarDisplayConfig";

/**
 * Célula da grade mensal — só orientação temporal. Nunca renderiza
 * o card completo do evento aqui, só até 3 indicadores (ou 2 +
 * contador "+N"), e nunca cresce verticalmente com a quantidade de
 * eventos do dia.
 */
export default function CalendarMonthCell({
  dateString,
  dayNumber,
  inCurrentMonth,
  isToday,
  isSelected,
  events,
  onSelect,
}) {
  const visibleEvents = events.length > 3 ? events.slice(0, 2) : events.slice(0, 3);
  const hiddenCount = events.length > 3 ? events.length - 2 : 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(dateString)}
      className={`flex min-h-[92px] flex-col items-start gap-1.5 rounded-xl border p-2 text-left transition ${
        isSelected
          ? "border-blue-500 bg-blue-50"
          : "border-transparent hover:bg-gray-50"
      } ${!inCurrentMonth ? "opacity-40" : ""}`}
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
          isToday ? "bg-blue-600 text-white" : "text-gray-700"
        }`}
      >
        {dayNumber}
      </span>

      <div className="flex w-full flex-col gap-1">
        {visibleEvents.map((event) => {
          const config = getEventGroupConfig(event.eventGroup);

          return (
            <div
              key={event.id}
              className="flex items-center gap-1.5 overflow-hidden"
              title={event.title}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${config.dot}`} />
              <span className="truncate text-[11px] text-gray-600">
                {event.title}
              </span>
            </div>
          );
        })}

        {hiddenCount > 0 && (
          <span className="text-[11px] font-medium text-gray-400">
            +{hiddenCount}
          </span>
        )}
      </div>
    </button>
  );
}
