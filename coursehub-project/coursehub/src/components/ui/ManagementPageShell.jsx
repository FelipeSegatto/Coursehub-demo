import { Link } from "react-router-dom";

import StatCard from "./StatCard";
import QuickActionsCard from "./QuickActionsCard";

function ManagementPageShell({
  title,
  description,
  createButtonText,
  onCreateClick,
  stats = [],
  tableTitle,
  tableActions,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar...",
  children,
  quickActions = [],
  backTo,
}) {
  return (
    <main className="p-6">
      <section className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{title}</h1>

          {description && <p className="mt-2 text-gray-600">{description}</p>}
        </div>

        {createButtonText && (
          <button
            type="button"
            onClick={onCreateClick}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            {createButtonText}
          </button>
        )}
      </section>

      {stats.length > 0 && (
        <section className="grid gap-6 md:grid-cols-4">
          {stats.map((stat) => (
            <StatCard key={stat.title} title={stat.title} value={stat.value} />
          ))}
        </section>
      )}

      <section className="mt-8 rounded-2xl bg-white p-6 shadow">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {tableTitle}
          </h2>

          <div className="flex w-full flex-col gap-3 sm:flex-row md:w-auto md:flex-1 md:justify-end">
            {onSearchChange && (
              <input
                type="text"
                value={searchValue}
                onChange={(event) =>
                  onSearchChange(event.target.value)
                }
                placeholder={searchPlaceholder}
                className="w-full rounded-xl border border-gray-300 px-4 py-2.5 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:w-80"
              />
            )}

            {tableActions}
          </div>
        </div>

        {children}
      </section>

      {quickActions.length > 0 && (
        <section className="mt-8 rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-bold text-gray-900">
            Ações rápidas
          </h2>

          <div className="grid gap-4 md:grid-cols-3">
            {quickActions.map((action) => (
              <QuickActionsCard
                key={action.title}
                title={action.title}
                description={action.description}
                icon={action.icon}
                to={action.to}
                onClick={action.onClick}
                disabled={action.disabled}
                disabledReason={action.disabledReason}
              />
            ))}
          </div>

          <div className="mt-6">
            <Link
              to={backTo}
              className="inline-block rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Voltar ao dashboard
            </Link>
          </div>
        </section>
      )}
    </main>
  );
}

export default ManagementPageShell;
