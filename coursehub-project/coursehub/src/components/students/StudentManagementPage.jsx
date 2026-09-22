import { Link } from "react-router-dom";

import StatCard from "../ui/StatCard";
import QuickActionsCard from "../ui/QuickActionsCard";

export default function StudentManagementPage({
  title,
  description,

  stats = [],

  /*
   * Nomes genéricos novos.
   */
  sectionTitle,
  sectionDescription,
  sectionActions,

  /*
   * Compatibilidade com páginas atuais.
   */
  tableTitle,
  tableActions,

  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar...",

  quickActions = [],

  children,

  infoTitle = "Como funciona",
  infoCards = [],

  backTo = "/aluno/dashboard-aluno",
  backLabel = "Voltar ao dashboard",
}) {
  /*
   * Mantém compatibilidade com as páginas atuais.
   */
  const resolvedSectionTitle =
    sectionTitle || tableTitle;

  const resolvedSectionActions =
    sectionActions || tableActions;

  const hasSearch =
    typeof searchValue === "string" &&
    typeof onSearchChange === "function";

  const hasSectionHeader =
    resolvedSectionTitle ||
    sectionDescription ||
    resolvedSectionActions ||
    hasSearch;

  return (
    <main className="p-4 sm:p-6">
      <section className="mb-8">
        {backTo && (
          <Link
            to={backTo}
            className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-blue-600 transition hover:text-blue-800"
          >
            <span aria-hidden="true">←</span>
            {backLabel}
          </Link>
        )}

        <h1 className="text-3xl font-bold text-gray-900">
          {title}
        </h1>

        {description && (
          <p className="mt-2 text-gray-600">
            {description}
          </p>
        )}
      </section>

      {stats.length > 0 && (
        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat, index) => (
            <StatCard
              key={
                stat.id ||
                stat.key ||
                `${stat.title}-${index}`
              }
              title={stat.title}
              value={stat.value}
              color={stat.color}
            />
          ))}
        </section>
      )}

      {quickActions.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 text-xl font-bold text-gray-900">
            Ações rápidas
          </h2>

          <div className="grid gap-4 md:grid-cols-3">
            {quickActions.map(
              (action, index) => (
                <QuickActionsCard
                  key={
                    action.id ||
                    action.key ||
                    `${action.title}-${index}`
                  }
                  title={action.title}
                  description={action.description}
                  icon={action.icon}
                  to={action.to}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  disabledReason={action.disabledReason}
                />
              )
            )}
          </div>
        </section>
      )}

      <section className="mt-8 rounded-2xl bg-white p-6 shadow">
        {hasSectionHeader && (
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              {resolvedSectionTitle && (
                <h2 className="text-xl font-bold text-gray-900">
                  {resolvedSectionTitle}
                </h2>
              )}

              {sectionDescription && (
                <p className="mt-1 text-sm text-gray-500">
                  {sectionDescription}
                </p>
              )}
            </div>

            {(hasSearch ||
              resolvedSectionActions) && (
              <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
                {hasSearch && (
                  <input
                    type="text"
                    value={searchValue}
                    onChange={(event) =>
                      onSearchChange(
                        event.target.value
                      )
                    }
                    placeholder={
                      searchPlaceholder
                    }
                    className="w-full rounded-xl border border-gray-300 px-4 py-2 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:w-96"
                  />
                )}

                {resolvedSectionActions}
              </div>
            )}
          </div>
        )}

        {children}
      </section>

      {infoCards.length > 0 && (
        <section className="mt-8 rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-bold text-gray-900">
            {infoTitle}
          </h2>

          <div className="grid gap-4 md:grid-cols-3">
            {infoCards.map(
              (card, index) => (
                <article
                  key={
                    card.id ||
                    card.key ||
                    `${card.title}-${index}`
                  }
                  className="rounded-xl border border-gray-200 p-4"
                >
                  <h3 className="font-semibold text-gray-900">
                    {card.title}
                  </h3>

                  <p className="mt-2 text-sm text-gray-600">
                    {card.description}
                  </p>
                </article>
              )
            )}
          </div>
        </section>
      )}
    </main>
  );
}