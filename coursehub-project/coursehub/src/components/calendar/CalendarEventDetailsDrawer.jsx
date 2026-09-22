import { Dialog } from "radix-ui";
import { Link } from "react-router-dom";
import { X, Calendar, Clock } from "lucide-react";
import { formatDisplayDate } from "../../utils/dateUtils";
import { getEventGroupConfig } from "./calendarDisplayConfig";

function ActionButton({ action, onEdit, onCancel }) {
  const baseClass =
    "w-full rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

  if (action.type === "navigate") {
    if (action.disabled) {
      return (
        <div>
          <span className={`block ${baseClass} bg-gray-100 text-gray-400`}>
            {action.label}
          </span>
          {action.reason && (
            <p className="mt-1 text-xs text-gray-500">{action.reason}</p>
          )}
        </div>
      );
    }

    return (
      <Link
        to={action.target}
        className={`block ${baseClass} bg-blue-600 text-white hover:bg-blue-700`}
      >
        {action.label}
      </Link>
    );
  }

  if (action.type === "edit") {
    return (
      <button
        type="button"
        onClick={onEdit}
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
        onClick={onCancel}
        className={`${baseClass} bg-red-50 text-red-600 hover:bg-red-100`}
      >
        {action.label}
      </button>
    );
  }

  return null;
}

export default function CalendarEventDetailsDrawer({ event, onClose, onEdit, onCancel }) {
  const groupConfig = event ? getEventGroupConfig(event.eventGroup) : null;

  return (
    <Dialog.Root
      open={Boolean(event)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />

        <Dialog.Content className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right">
          {event && (
            <>
              <div className="flex items-start justify-between gap-4">
                <span
                  className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${groupConfig.badge}`}
                >
                  {groupConfig.label}
                </span>

                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label="Fechar"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100"
                  >
                    <X size={18} />
                  </button>
                </Dialog.Close>
              </div>

              <Dialog.Title className="mt-4 text-xl font-bold text-gray-900">
                {event.title}
              </Dialog.Title>

              {event.description && (
                <Dialog.Description className="mt-2 whitespace-pre-line text-sm text-gray-600">
                  {event.description}
                </Dialog.Description>
              )}

              <div className="mt-6 space-y-3 border-t border-gray-100 pt-5 text-sm">
                <div className="flex items-center gap-2 text-gray-700">
                  <Calendar size={16} className="text-gray-400" />
                  <span>
                    {formatDisplayDate(event.startDate)}
                    {event.endDate && event.endDate !== event.startDate
                      ? ` até ${formatDisplayDate(event.endDate)}`
                      : ""}
                  </span>
                </div>

                {!event.allDay && event.startTime && (
                  <div className="flex items-center gap-2 text-gray-700">
                    <Clock size={16} className="text-gray-400" />
                    <span>
                      {event.startTime}
                      {event.endTime ? ` – ${event.endTime}` : ""}
                    </span>
                  </div>
                )}

                {(event.courseName || event.className) && (
                  <div className="grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3">
                    {event.courseName && (
                      <div>
                        <p className="text-xs font-semibold uppercase text-gray-400">
                          Curso
                        </p>
                        <p className="text-gray-800">{event.courseName}</p>
                      </div>
                    )}

                    {event.className && (
                      <div>
                        <p className="text-xs font-semibold uppercase text-gray-400">
                          Turma
                        </p>
                        <p className="text-gray-800">{event.className}</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-gray-400">
                    Status
                  </span>
                  <span className="font-medium text-gray-800">
                    {event.statusText}
                  </span>
                </div>
              </div>

              {event.actions.length > 0 && (
                <div className="mt-6 space-y-2">
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
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
