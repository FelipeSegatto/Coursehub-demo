import { useMemo } from "react";
import { formatDisplayDate } from "../../utils/dateUtils";
import { getIndicatorTypeLabel } from "./calendarDisplayConfig";
import CalendarAgendaItem from "./CalendarAgendaItem";

/**
 * Agenda do dia selecionado — a principal área informativa do
 * calendário. Agrupa por categoria (indicatorType), preservando a
 * ordem já vinda do backend (data, prioridade, horário, título) —
 * o primeiro grupo a aparecer é sempre o mais urgente.
 */
export default function CalendarAgendaSection({
  selectedDate,
  events,
  onOpenDetails,
  onEdit,
  onCancel,
}) {
  const groups = useMemo(() => {
    const order = [];
    const byType = new Map();

    for (const event of events) {
      if (!byType.has(event.indicatorType)) {
        byType.set(event.indicatorType, []);
        order.push(event.indicatorType);
      }

      byType.get(event.indicatorType).push(event);
    }

    return order.map((indicatorType) => ({
      indicatorType,
      label: getIndicatorTypeLabel(indicatorType),
      events: byType.get(indicatorType),
    }));
  }, [events]);

  return (
    <section className="mt-6">
      <h3 className="text-base font-bold capitalize text-gray-900">
        {formatDisplayDate(selectedDate, {
          day: "2-digit",
          month: "long",
        })}
      </h3>

      {groups.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">
          Nenhum acontecimento neste dia.
        </p>
      ) : (
        <div className="mt-4 space-y-6">
          {groups.map((group) => (
            <div key={group.indicatorType}>
              <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">
                {group.label}
              </h4>

              <div className="space-y-3">
                {group.events.map((event) => (
                  <CalendarAgendaItem
                    key={event.id}
                    event={event}
                    onOpenDetails={onOpenDetails}
                    onEdit={onEdit}
                    onCancel={onCancel}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
