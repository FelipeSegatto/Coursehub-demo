import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getAdminDashboard } from "../../services/DashboardService";
import ProgressDonutChart from "../../components/charts/ProgressDonutChart";
import { FINANCIAL_CHART_COLORS } from "../../components/charts/progressChartColors";
import StatCard from "../../components/ui/StatCard";
import QuickActionsCard from "../../components/ui/QuickActionsCard";
import PrintPageButton from "../../components/reports/PrintPageButton";
import { formatDisplayDate } from "../../utils/dateUtils";

function formatShortDate(dateString) {
  if (!dateString) return null;

  return formatDisplayDate(dateString, { day: "2-digit", month: "short" });
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}

const quickActions = [
  {
    title: "Cadastrar aluno",
    description: "Adicione um novo aluno à plataforma.",
    to: "/admin/alunos",
  },
  {
    title: "Criar curso",
    description: "Cadastre um novo curso.",
    to: "/admin/cursos",
  },
  {
    title: "Cadastrar professor",
    description: "Adicione um novo professor.",
    to: "/admin/professores",
  },
  {
    title: "Emitir certificado",
    description: "Gerencie certificados dos alunos.",
    to: "/admin/emissao",
  },
  {
    title: "Gerenciar materiais",
    description: "Vídeos, PDFs, textos e aulas ao vivo de todos os cursos.",
    to: "/admin/materiais",
  },
];

export default function DashboardAdmin() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const data = await getAdminDashboard();

      setDashboard(data);
    } catch (requestError) {
      console.error("[DashboardAdmin] erro:", requestError);

      setError(
        requestError?.message ||
          "Não foi possível carregar o dashboard administrativo."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const summary = dashboard?.summary;
  const financial = dashboard?.financial;
  const academic = dashboard?.academic;
  const operations = dashboard?.operations;
  const upcomingEvents = dashboard?.upcomingEvents ?? [];

  const paidAmount = Number(financial?.paidAmount || 0);
  const openAmount = Number(financial?.openAmount || 0);
  const overdueAmount = Number(financial?.overdueAmount || 0);
  const financialTotal = paidAmount + openAmount + overdueAmount;
  const receivedPercent =
    financialTotal > 0 ? Math.round((paidAmount / financialTotal) * 100) : 0;
  const financialChartData = [
    { name: "Recebido", value: paidAmount },
    { name: "Em aberto", value: openAmount },
    { name: "Em atraso", value: overdueAmount },
  ];

  const pendingItems = [
    ...(dashboard?.administrativePendingItems ?? []),
    {
      type: "pending_submissions",
      label: "Envios aguardando correção",
      count: academic?.pendingSubmissions ?? 0,
      deepLink: null,
    },
    {
      type: "overdue_invoices",
      label: "Faturas em atraso",
      count: financial?.overdueInvoices ?? 0,
      deepLink: "/admin/financeiro/cobrancas",
    },
  ].filter((item) => item.count > 0);

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="print-area mx-auto max-w-7xl">
        <section className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-600">
              Área do Administrador
            </p>

            <h1 className="mt-2 text-4xl font-bold text-gray-900">
              Painel administrativo
            </h1>

            <p className="mt-3 max-w-3xl text-gray-600">
              Gerencie alunos, cursos, professores e acompanhe os principais
              indicadores da plataforma.
            </p>
          </div>

          <div className="flex gap-3 print-hide">
            <button
              type="button"
              onClick={loadDashboard}
              disabled={loading}
              className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
            >
              Atualizar
            </button>

            <PrintPageButton />
          </div>
        </section>

        {error && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>

            <button
              type="button"
              onClick={loadDashboard}
              className="print-hide text-sm font-semibold text-red-700 hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {loading && !dashboard ? (
          <div className="flex min-h-[420px] items-center justify-center">
            <span className="h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
          </div>
        ) : (
          <>
            <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                title="Alunos ativos"
                value={academic?.activeStudents ?? 0}
                color="green"
                to="/admin/alunos?status=active"
              />

              <StatCard
                title="Professores ativos"
                value={academic?.activeTeachers ?? 0}
                color="purple"
                to="/admin/professores?status=active"
              />

              <StatCard
                title="Cursos ativos"
                value={summary?.activeCourses ?? 0}
                to="/admin/cursos?status=active"
              />

              <StatCard
                title="Turmas ativas"
                value={summary?.activeClasses ?? 0}
                color="yellow"
                to="/admin/turmas?status=active"
              />

              <StatCard
                title="Alunos sem turma"
                value={operations?.studentsWithoutClass ?? 0}
                color="yellow"
                to="/admin/matriculas?classStatus=unassigned"
              />

              <StatCard
                title="Matrículas pendentes"
                value={operations?.pendingEnrollments ?? 0}
                color="red"
                to="/admin/matriculas?status=pending_activation"
              />

              <StatCard
                title="Cobranças em atraso"
                value={operations?.overdueInvoices ?? 0}
                color="red"
                to="/admin/financeiro/cobrancas?status=overdue"
              />

              <StatCard
                title="Requerimentos pendentes"
                value={operations?.openAdministrativeRequests ?? 0}
                color="purple"
                to="/admin/chat?pending=true"
              />
            </section>

            <section className="mt-8 grid gap-6 lg:grid-cols-3">
              <div className="rounded-2xl bg-white p-6 shadow-sm lg:col-span-2">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900">
                    Ações rápidas
                  </h2>

                  <p className="mt-1 text-gray-500">
                    Acesse as principais funções administrativas.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {quickActions.map((action) => (
                    <QuickActionsCard key={action.title} {...action} />
                  ))}
                </div>
              </div>

              <div>
                <ProgressDonutChart
                  title="Resumo financeiro"
                  description="Composição das faturas vigentes: o que já entrou, o que ainda vence e o que está atrasado."
                  centerValue={`${receivedPercent}%`}
                  centerLabel="recebido"
                  data={financialChartData}
                  colors={FINANCIAL_CHART_COLORS}
                  formatValue={formatCurrency}
                />

                <p className="mt-3 px-1 text-xs text-gray-500">
                  {operations?.invoicesOverdue15Days ?? 0} faturas com 15+ dias ·{" "}
                  {operations?.invoicesOverdue30Days ?? 0} com 30+ dias
                </p>

                <Link
                  to="/admin/financeiro"
                  className="mt-2 inline-block px-1 text-sm font-semibold text-blue-600 hover:underline"
                >
                  Ver painel financeiro completo →
                </Link>
              </div>
            </section>

            <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900">Operação recente</h2>
              <p className="mt-1 text-sm text-gray-500">Últimos 7 dias.</p>

              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">Novos usuários</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{operations?.newUsersLast7Days ?? 0}</p>
                </div>

                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">Novas matrículas</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{operations?.newEnrollmentsLast7Days ?? 0}</p>
                </div>

                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-sm text-gray-500">Checkouts concluídos</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {operations?.completedCheckoutsLast7Days ?? 0}
                  </p>
                </div>
              </div>
            </section>

            <section className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl bg-white p-6 shadow-sm">
                <h2 className="text-2xl font-bold text-gray-900">
                  Pendências
                </h2>

                {pendingItems.length === 0 ? (
                  <p className="mt-6 text-center text-gray-500">
                    Nenhuma pendência no momento.
                  </p>
                ) : (
                  <div className="mt-6 space-y-4">
                    {pendingItems.map((item) => {
                      const row = (
                        <div className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
                          <span className="text-sm font-medium text-gray-700">
                            {item.label}
                          </span>

                          <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-700">
                            {item.count}
                          </span>
                        </div>
                      );

                      return item.deepLink ? (
                        <Link
                          key={item.type}
                          to={item.deepLink}
                          className="block transition hover:opacity-80"
                        >
                          {row}
                        </Link>
                      ) : (
                        <div key={item.type}>{row}</div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-white p-6 shadow-sm">
                <h2 className="text-2xl font-bold text-gray-900">
                  Próximos eventos
                </h2>

                {upcomingEvents.length === 0 ? (
                  <p className="mt-6 text-center text-gray-500">
                    Nenhum evento nos próximos 7 dias.
                  </p>
                ) : (
                  <div className="mt-6 space-y-4">
                    {upcomingEvents.map((event) => (
                      <div
                        key={event.id}
                        className="rounded-xl border border-gray-100 p-4 text-sm text-gray-700"
                      >
                        <p className="font-semibold text-gray-900">
                          {event.title}
                        </p>

                        <p className="mt-1 text-gray-500">
                          {event.displaySubtitle || event.courseName || ""}
                          {event.displaySubtitle || event.courseName
                            ? " · "
                            : ""}
                          {formatShortDate(event.startDate)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-bold text-gray-900">Atendimento</h2>

              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <Link to="/admin/chat" className="block rounded-xl bg-gray-50 p-4 transition hover:opacity-80">
                  <p className="text-sm text-gray-500">Requerimentos abertos</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{operations?.openAdministrativeRequests ?? 0}</p>
                </Link>

                <Link to="/admin/chat" className="block rounded-xl bg-gray-50 p-4 transition hover:opacity-80">
                  <p className="text-sm text-gray-500">Sem responsável</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {operations?.unassignedAdministrativeRequests ?? 0}
                  </p>
                </Link>

                <Link to="/admin/contatos" className="block rounded-xl bg-gray-50 p-4 transition hover:opacity-80">
                  <p className="text-sm text-gray-500">Novos contatos</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{operations?.newPublicContacts ?? 0}</p>
                </Link>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
