import NotificationItem from "./NotificationItem";

export default function NotificationList({
  items,
  loading,
  error,
  onRetry,
  nextCursor,
  loadingMore,
  onLoadMore,
  onMarkRead,
  onArchive,
}) {
  if (loading) {
    return <p className="py-12 text-center text-gray-500">Carregando notificações...</p>;
  }

  if (error) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-700">{error}</p>

        <button type="button" onClick={onRetry} className="text-sm font-semibold text-red-700 hover:underline">
          Tentar novamente
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="py-12 text-center text-gray-500">Nenhuma notificação por aqui.</p>;
  }

  return (
    <>
      <div className="space-y-4">
        {items.map((item) => (
          <NotificationItem
            key={item.recipientId}
            item={item}
            onMarkRead={onMarkRead}
            onArchive={onArchive}
          />
        ))}
      </div>

      {nextCursor && (
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:opacity-60"
          >
            {loadingMore ? "Carregando..." : "Carregar mais"}
          </button>
        </div>
      )}
    </>
  );
}
