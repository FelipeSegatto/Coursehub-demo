import { Link } from "react-router-dom";
import { getEventGroupConfig, getPriorityAccent } from "./calendarDisplayConfig";

function ActionButton({ action, onEdit, onCancel }) {
  const baseClass =
    "rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

  if (action.type === "navigate") {
    if (action.disabled) {
      return (
        <span
          title={action.reason || ""}
          className={`${baseClass} bg-gray-100 text-gray-400`}
        >
          {action.label}
        </span>
      );
    }

    return (
      <Link
        to={action.target}
        onClick={(event) => event.stopPropagation()}
        className={`${baseClass} bg-blue-100 text-blue-700 hover:bg-blue-200`}
      >
        {action.label}
      </Link>
    );
  }

  if (action.type === "edit") {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onEdit?.();
        }}
        className={`${baseClass} bg-gray-100 text-gray-700 hover:bg-gray-200`}
      >
        {action.label}
      </button>
    );
  }

  if (action.type === "cancel") {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onCancel?.();
        }}
        className={`${baseClass} bg-red-50 text-red-600 hover:bg-red-100`}
      >
        {action.label}
      </button>
    );
  }

  return null;
}

export default function CalendarAgendaItem({ event, onOpenDetails, onEdit, onCancel }) {
  const groupConfig = getEventGroupConfig(event.eventGroup);
  const accent = getPriorityAccent(event.displayPriority);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetails(event)}
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.key === "Enter") onOpenDetails(event);
      }}
      className={`flex cursor-pointer flex-col gap-2 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition hover:shadow-md ${accent} ${
        event.status === "cancelled" ? "opacity-60" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${groupConfig.badge}`}
          >
            {groupConfig.label}
          </span>

          <h4 className="mt-1.5 font-semibold text-gray-900">{event.title}</h4>

          {event.displaySubtitle && (
            <p className="mt-0.5 text-sm text-gray-500">{event.displaySubtitle}</p>
          )}
        </div>

        <span className="text-xs font-medium text-gray-500">{event.statusText}</span>
      </div>

      {event.actions.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {event.actions.map((action, index) => (
            <ActionButton
              key={`${event.id}-${action.type}-${index}`}
              action={action}
              onEdit={() => onEdit?.(event)}
              onCancel={() => onCancel?.(event)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
