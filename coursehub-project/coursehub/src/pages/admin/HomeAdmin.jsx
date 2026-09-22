import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import StaffWelcomeBanner from "../../components/StaffWelcomeBanner";
import StatCard from "../../components/ui/StatCard";
import { getAdminDashboard } from "../../services/DashboardService";

const SHORTCUTS = [
  { to: "/admin/dashboard-admin", title: "Painel completo", description: "Indicadores acadêmicos, financeiros e operação dos últimos 7 dias." },
  { to: "/admin/matriculas", title: "Matrículas", description: "Ativar, trancar, migrar e acompanhar status acadêmico." },
  { to: "/admin/financeiro/cobrancas", title: "Cobranças", description: "Faturas em atraso, PIX e baixas manuais." },
  { to: "/admin/frequencia", title: "Frequência", description: "Encontros lançados e ajustes de presença." },
  { to: "/admin/contatos", title: "Contatos", description: "Mensagens públicas de Fale conosco." },
  { to: "/admin/usuarios", title: "Usuários", description: "Admins, professores, alunos e status de conta." },
];

export default function HomeAdmin() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    getAdminDashboard()
      .then((data) => {
        if (!cancelled) setDashboard(data);
      })
      .catch((error) => {
        console.error("Erro ao carregar resumo da home admin:", error);
        if (!cancelled) setDashboard(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const operations = dashboard?.operations;
  const academic = dashboard?.academic;
  const pendingCount =
    (operations?.pendingEnrollments || 0) +
    (operations?.overdueInvoices || 0) +
    (operations?.studentsWithoutClass || 0) +
    (operations?.openAdministrativeRequests || 0);

  const statusMessage = loading
    ? "Organizando o resumo da secretaria..."
    : pendingCount === 0
      ? "Nada urgente na fila agora. Bom momento para olhar o painel, revisar contatos ou acompanhar as turmas."
      : `Há ${pendingCount} item${pendingCount === 1 ? "" : "s"} pedindo atenção. Os cartões abaixo levam direto às filas.`;

  return (
    <section className="px-2 py-6 sm:px-4 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <StaffWelcomeBanner
          eyebrow="Secretaria"
          description="Que bom ter você por aqui. Este é o ponto de partida da secretaria: o que precisa de cuidado hoje, e atalhos para o resto do trabalho."
          statusMessage={statusMessage}
          action={{ to: "/admin/dashboard-admin", label: "Abrir painel" }}
          image="/images/coursehub-hero-blue.webp"
          imageAlt="Materiais escolares sobre fundo azul"
        />

        {loading ? (
          <p className="text-gray-600">Carregando resumo...</p>
        ) : (
          <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
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
              title="Alunos sem turma"
              value={operations?.studentsWithoutClass ?? 0}
              color="yellow"
              to="/admin/matriculas?classStatus=unassigned"
            />
            <StatCard
              title="Requerimentos abertos"
              value={operations?.openAdministrativeRequests ?? 0}
              color="purple"
              to="/admin/chat?pending=true"
            />
          </section>
        )}

        {!loading && dashboard && (
          <section className="mt-8 rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Nos últimos 7 dias</h2>
            <p className="mt-1 text-sm text-slate-500">
              Movimento recente da instituição, mesmo quando a fila do dia está calma.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl bg-sky-50 px-4 py-4">
                <p className="text-sm text-slate-500">Novos usuários</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{operations?.newUsersLast7Days ?? 0}</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 px-4 py-4">
                <p className="text-sm text-slate-500">Novas matrículas</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{operations?.newEnrollmentsLast7Days ?? 0}</p>
              </div>
              <div className="rounded-2xl bg-indigo-50 px-4 py-4">
                <p className="text-sm text-slate-500">Checkouts concluídos</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{operations?.completedCheckoutsLast7Days ?? 0}</p>
              </div>
              <Link to="/admin/contatos" className="rounded-2xl bg-amber-50 px-4 py-4 transition hover:bg-amber-100">
                <p className="text-sm text-slate-500">Novos contatos</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{operations?.newPublicContacts ?? 0}</p>
              </Link>
            </div>
          </section>
        )}

        <section className="mt-10">
          <h2 className="text-xl font-bold text-gray-900">Atalhos</h2>
          <p className="mt-1 text-sm text-gray-500">
            {academic?.activeStudents != null
              ? `${academic.activeStudents} alunos ativos na instituição.`
              : "Caminhos do dia a dia da secretaria."}
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SHORTCUTS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
              >
                <h3 className="font-semibold text-gray-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">{item.description}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}