import { useMemo } from "react";
import { getMonthGridDays, getWeekdayLabels, todayDateString } from "../../utils/dateUtils";
import CalendarMonthCell from "./CalendarMonthCell";

export default function CalendarMonthGrid({
  year,
  month,
  events,
  selectedDate,
  onSelectDate,
}) {
  const days = useMemo(() => getMonthGridDays(year, month), [year, month]);
  const today = todayDateString();

  const eventsByDate = useMemo(() => {
    const map = new Map();

    for (const event of events) {
      const list = map.get(event.startDate) || [];
      list.push(event);
      map.set(event.startDate, list);
    }

    return map;
  }, [events]);

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 pb-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-400">
        {getWeekdayLabels().map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => (
          <CalendarMonthCell
            key={day.dateString}
            dateString={day.dateString}
            dayNumber={day.dayNumber}
            inCurrentMonth={day.inCurrentMonth}
            isToday={day.dateString === today}
            isSelected={day.dateString === selectedDate}
            events={eventsByDate.get(day.dateString) || []}
            onSelect={onSelectDate}
          />
        ))}
      </div>
    </div>
  );
}
