import { Link } from "react-router-dom";
import StatCard from "../ui/StatCard";
import { useNotificationInbox } from "../../hooks/useNotificationInbox";
import NotificationFilters from "./NotificationFilters";
import NotificationList from "./NotificationList";
import NotificationPreferences from "./NotificationPreferences";

/**
 * Role-agnostic notification center shell -- every role's page
 * (aluno/professor/admin) is a thin wrapper that only supplies
 * title/description/backLink; the data, filters, list, and
 * preferences panel are identical across roles.
 */
export default function NotificationCenterPage({ title, description, backLink, categories }) {
  const {
    status,
    setStatus,
    category,
    setCategory,
    items,
    nextCursor,
    unreadCount,
    loading,
    loadingMore,
    error,
    loadFirstPage,
    handleLoadMore,
    handleMarkRead,
    handleMarkAllRead,
    handleArchive,
  } = useNotificationInbox();

  return (
    <main className="p-4 sm:p-6">
      <section className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
        <p className="mt-2 text-gray-600">{description}</p>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <StatCard title="Não lidas" value={unreadCount} color="blue" />
        <StatCard title="Nesta página" value={items.length} />
      </section>

      <section className="mt-8 rounded-2xl bg-white p-6 shadow">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h2 className="text-xl font-bold text-gray-900">Minhas notificações</h2>

          <NotificationFilters
            status={status}
            onStatusChange={setStatus}
            unreadCount={unreadCount}
            onMarkAllRead={handleMarkAllRead}
            categories={categories}
            category={category}
            onCategoryChange={setCategory}
          />
        </div>

        <NotificationList
          items={items}
          loading={loading}
          error={error}
          onRetry={loadFirstPage}
          nextCursor={nextCursor}
          loadingMore={loadingMore}
          onLoadMore={handleLoadMore}
          onMarkRead={handleMarkRead}
          onArchive={handleArchive}
        />
      </section>

      <section className="mt-8 rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-1 text-xl font-bold text-gray-900">Preferências de e-mail</h2>
        <p className="mb-6 text-sm text-gray-500">
          Notificações no CourseHub continuam aparecendo aqui independentemente destas opções --
          elas controlam apenas o envio por e-mail.
        </p>

        <NotificationPreferences />
      </section>

      <section className="mt-8 rounded-2xl bg-white p-6 shadow">
        <Link
          to={backLink}
          className="inline-block rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition"
        >
          Voltar ao dashboard
        </Link>
      </section>
    </main>
  );
}
