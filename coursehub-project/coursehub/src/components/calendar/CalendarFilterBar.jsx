import { getIndicatorTypeLabel } from "./calendarDisplayConfig";

/**
 * Filtros de segundo nível — só mostra categorias que realmente têm
 * eventos no período carregado (counts.byIndicatorType), evitando
 * ruído com opções sempre vazias.
 */
export default function CalendarFilterBar({
  counts,
  activeIndicatorTypes,
  onToggle,
}) {
  const availableTypes = Object.keys(counts?.byIndicatorType || {}).sort(
    (a, b) => (counts.byIndicatorType[b] || 0) - (counts.byIndicatorType[a] || 0)
  );

  if (availableTypes.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 py-3">
      {availableTypes.map((indicatorType) => {
        const isActive = activeIndicatorTypes.has(indicatorType);

        return (
          <button
            key={indicatorType}
            type="button"
            onClick={() => onToggle(indicatorType)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              isActive
                ? "border-blue-600 bg-blue-50 text-blue-700"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {getIndicatorTypeLabel(indicatorType)}
            <span className="ml-1.5 text-gray-400">
              {counts.byIndicatorType[indicatorType]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
