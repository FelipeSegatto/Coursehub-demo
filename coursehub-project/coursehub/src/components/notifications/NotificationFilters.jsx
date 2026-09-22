const STATUS_FILTERS = [
  { value: "all", label: "Todas" },
  { value: "unread", label: "Não lidas" },
  { value: "read", label: "Lidas" },
];

/**
 * `categories` is optional and props-driven -- when omitted (student/
 * teacher inboxes), only the status row renders, unchanged from
 * before. Only NotificationsAdmin.jsx passes it (see
 * ADMIN_NOTIFICATION_CATEGORY_FILTERS in
 * constants/notificationCategories.js), so status and category stay
 * two independent filters ("Financeiro" + "Não lidas" both apply at
 * once) rather than one combined list.
 */
export default function NotificationFilters({
  status,
  onStatusChange,
  unreadCount,
  onMarkAllRead,
  categories,
  category,
  onCategoryChange,
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => onStatusChange(filter.value)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                status === filter.value
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onMarkAllRead}
          disabled={unreadCount === 0}
          className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Marcar todas como lidas
        </button>
      </div>

      {categories && categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {categories.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => onCategoryChange(filter.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                category === filter.value
                  ? "bg-blue-100 text-blue-700 ring-1 ring-blue-300"
                  : "bg-gray-50 text-gray-600 hover:bg-gray-100"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
