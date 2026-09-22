import { Link } from "react-router-dom";
import { getNotificationCategoryLabel } from "../../constants/notificationCategories";

const PRIORITY_LABEL = {
  urgent: { text: "Urgente", className: "bg-red-100 text-red-700" },
  high: { text: "Importante", className: "bg-yellow-100 text-yellow-700" },
  normal: null,
};

function formatDateTime(value) {
  if (!value) return "-";

  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NotificationItem({ item, onMarkRead, onArchive }) {
  const isUnread = !item.readAt;
  const priorityBadge = PRIORITY_LABEL[item.priority];

  return (
    <article
      className={`rounded-2xl border p-5 ${
        isUnread ? "border-blue-200 bg-blue-50" : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {priorityBadge && (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${priorityBadge.className}`}>
                {priorityBadge.text}
              </span>
            )}

            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                isUnread ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
              }`}
            >
              {isUnread ? "Não lida" : "Lida"}
            </span>

            {item.category && (
              <span className="rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-500 ring-1 ring-gray-200">
                {getNotificationCategoryLabel(item.category)}
              </span>
            )}
          </div>

          <h3 className="text-lg font-bold text-gray-900">{item.title}</h3>
          <p className="mt-2 text-gray-600">{item.message}</p>
          <p className="mt-3 text-sm text-gray-500">{formatDateTime(item.createdAt)}</p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            to={item.actionPath}
            onClick={() => isUnread && onMarkRead(item.notificationId)}
            className="shrink-0 whitespace-nowrap rounded-lg bg-blue-100 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-200 transition"
          >
            Ver detalhes
          </Link>

          {isUnread && (
            <button
              type="button"
              onClick={() => onMarkRead(item.notificationId)}
              className="shrink-0 whitespace-nowrap rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition"
            >
              Marcar como lida
            </button>
          )}

          <button
            type="button"
            onClick={() => onArchive(item.notificationId)}
            className="shrink-0 whitespace-nowrap rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 transition"
          >
            Arquivar
          </button>
        </div>
      </div>
    </article>
  );
}
