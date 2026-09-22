import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getTeacherDashboard } from "../../services/DashboardService";
import ClassAttendanceBarChart from "../../components/charts/ClassAttendanceBarChart";
import StatCard from "../../components/ui/StatCard";
import QuickActionsCard from "../../components/ui/QuickActionsCard";
import { formatDisplayDate } from "../../utils/dateUtils";

function formatShortDate(isoString) {
  if (!isoString) return null;

  return formatDisplayDate(isoString.slice(0, 10), {
    day: "2-digit",
    month: "short",
  });
}

const quickActions = [
  {
    title: "Atividades e provas",
    description: "Crie e gerencie tarefas e avaliações.",
    to: "/professor/atividades",
  },
  {
    title: "Corrigir provas",
    description: "Veja e corrija provas pendentes.",
    to: "/professor/avaliacoes",
  },
  {
    title: "Lançar notas",
    description: "Acesse o lançamento de notas das turmas.",
    to: "/professor/notas",
  },
  {
    title: "Minhas turmas",
    description: "Veja detalhes e alunos de cada turma.",
    to: "/professor/minhas-turmas",
  },
];

export default function TeacherDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const data = await getTeacherDashboard();

      setDashboard(data);
    } catch (requestError) {
      console.error("[TeacherDashboard] erro:", requestError);

      setError(
        requestError?.message ||
          "Não foi possível carregar o dashboard do professor."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const summary = dashboard?.summary;
  const pendingReviews = dashboard?.pendingReviews ?? [];
  const upcomingSessions = dashboard?.upcomingSessions ?? [];
  const classesOverview = dashboard?.classesOverview ?? [];
  const listedClasses = classesOverview.slice(0, 6);

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <section className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-600">
              Área do Professor
            </p>

            <h1 className="mt-2 text-4xl font-bold text-gray-900">
              Dashboard do professor
            </h1>

            <p className="mt-3 max-w-3xl text-gray-600">
              Acompanhe suas turmas, corrija tarefas e provas, lance notas e
              monitore o progresso dos alunos em um só lugar.
            </p>
          </div>

          <button
            type="button"
            onClick={loadDashboard}
            disabled={loading}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
          >
            Atualizar
          </button>
        </section>

        {error && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>

            <button
              type="button"
              onClick={loadDashboard}
              className="text-sm font-semibold text-red-700 hover:underline"
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
            <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                title="Turmas ativas"
                value={summary?.activeClasses ?? 0}
              />

              <StatCard
                title="Alunos acompanhados"
                value={summary?.uniqueActiveStudents ?? 0}
                color="green"
              />

              <StatCard
                title="Revisões pendentes"
                value={summary?.pendingReviews ?? 0}
                color={summary?.pendingReviews > 0 ? "yellow" : "blue"}
              />

              <StatCard
                title="Aulas e Eventos (7 dias)"
                value={summary?.upcomingCommitments ?? 0}
                color="purple"
              />
            </section>

            <section className="mt-8">
              <ClassAttendanceBarChart classes={classesOverview} />
            </section>

            <section className="mt-8 grid gap-6 lg:grid-cols-3">
              <div className="rounded-2xl bg-white p-6 shadow-sm lg:col-span-2">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">
                      Tarefas e provas pendentes
                    </h2>

                    <p className="mt-1 text-gray-500">
                      Atividades que precisam de correção, feedback ou
                      lançamento de notas.
                    </p>
                  </div>

                  <Link
                    to="/professor/atividades"
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                  >
                    Ver todas
                  </Link>
                </div>

                {pendingReviews.length === 0 ? (
                  <p className="py-6 text-center text-gray-500">
                    Nenhuma correção pendente no momento.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {pendingReviews.map((task) => (
                      <Link
                        key={task.activityId}
                        to={task.deepLink}
                        className="block rounded-xl border border-gray-100 bg-gray-50 p-5 transition hover:border-blue-200"
                      >
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div>
                            <h3 className="font-semibold text-gray-900">
                              {task.title}
                            </h3>

                            <p className="mt-1 text-sm text-gray-500">
                              {task.courseName}
                              {task.className ? ` · ${task.className}` : ""}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-3 text-sm">
                            <span className="rounded-full bg-white px-3 py-1 font-medium text-gray-600">
                              {task.pendingCount} pendente(s)
                            </span>

                            {task.dueDate && (
                              <span className="rounded-full bg-blue-100 px-3 py-1 font-semibold text-blue-700">
                                {formatShortDate(task.dueDate)}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-white p-6 shadow-sm">
                <h2 className="text-2xl font-bold text-gray-900">
                  Ações rápidas
                </h2>

                <div className="mt-6 grid gap-3">
                  {quickActions.map((action) => (
                    <QuickActionsCard key={action.title} {...action} />
                  ))}
                </div>
              </div>
            </section>

            <section className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl bg-white p-6 shadow-sm">
                <h2 className="text-2xl font-bold text-gray-900">
                  Minhas turmas
                </h2>

                {classesOverview.length === 0 ? (
                  <p className="mt-6 text-center text-gray-500">
                    Nenhuma turma ativa no momento.
                  </p>
                ) : (
                  <div className="mt-6 space-y-4">
                    {listedClasses.map((classItem) => (
                      <Link
                        key={classItem.classId}
                        to={`/professor/turmas/${classItem.classId}`}
                        className="block rounded-xl bg-gray-50 p-5 transition hover:bg-gray-100"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <h3 className="font-semibold text-gray-900">
                              {classItem.className}
                            </h3>

                            <p className="mt-1 text-sm text-gray-500">
                              {classItem.courseName}
                            </p>
                          </div>

                          <span className="text-sm font-semibold text-blue-600">
                            {classItem.activeStudentCount} alunos
                          </span>
                        </div>
                      </Link>
                    ))}

                    {classesOverview.length > listedClasses.length && (
                      <Link
                        to="/professor/minhas-turmas"
                        className="block text-center text-sm font-semibold text-blue-600"
                      >
                        Ver todas as turmas
                      </Link>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-2xl bg-white p-6 shadow-sm">
                <h2 className="text-2xl font-bold text-gray-900">
                  Próximos encontros
                </h2>

                {upcomingSessions.length === 0 ? (
                  <p className="mt-6 text-center text-gray-500">
                    Nenhum encontro agendado para os próximos 7 dias.
                  </p>
                ) : (
                  <div className="mt-6 space-y-4">
                    {upcomingSessions.map((session) => (
                      <Link
                        key={session.sessionId}
                        to={session.deepLink}
                        className="block rounded-xl border border-gray-100 p-4 text-sm transition hover:border-blue-200"
                      >
                        <p className="font-semibold text-gray-900">
                          {session.title}
                        </p>

                        <p className="mt-1 text-gray-500">
                          {session.className} ·{" "}
                          {formatShortDate(session.sessionDate)} ·{" "}
                          {session.startTime?.slice(0, 5)}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="mt-8 rounded-2xl bg-blue-600 p-8 text-white">
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Prioridade do dia</h2>

                  <p className="mt-2 max-w-2xl text-blue-100">
                    {summary?.pendingReviews > 0
                      ? `Você tem ${summary.pendingReviews} atividade(s) aguardando correção.`
                      : "Nenhuma correção pendente — tudo em dia por aqui."}
                  </p>
                </div>

                <Link
                  to="/professor/atividades"
                  className="rounded-xl bg-white px-5 py-3 font-semibold text-blue-600 transition hover:bg-blue-50"
                >
                  Ver atividades
                </Link>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
