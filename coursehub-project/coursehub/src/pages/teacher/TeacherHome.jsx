import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, CalendarDays, ClipboardCheck } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import StaffWelcomeBanner from "../../components/StaffWelcomeBanner";
import StatCard from "../../components/ui/StatCard";
import { apiFetch } from "../../services/APIService";
import { getTeacherDashboard } from "../../services/DashboardService";
import { formatDisplayDate } from "../../utils/dateUtils";
import { publicImageUrl } from "../../utils/publicImageUrl";

const SHORTCUTS = [
  { to: "/professor/dashboard-professor", title: "Dashboard", description: "Turmas, correções e agenda da semana." },
  { to: "/professor/minhas-turmas", title: "Minhas turmas", description: "Alunos, materiais e encontros de cada turma." },
  { to: "/professor/frequencia", title: "Frequência", description: "Lançar presença do encontro." },
  { to: "/professor/atividades", title: "Atividades", description: "Tarefas, prazos e envios." },
  { to: "/professor/avaliacoes", title: "Avaliações", description: "Provas pendentes de correção." },
  { to: "/professor/notas", title: "Notas", description: "Lançamento e consulta de notas." },
];

function formatSessionDate(value) {
  if (!value) return "";
  const day = String(value).slice(0, 10);
  return formatDisplayDate(day, { day: "2-digit", month: "short" }) || day;
}

export default function TeacherHome() {
  const { usuarioLogado } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!usuarioLogado?.id) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    Promise.all([
      getTeacherDashboard(),
      apiFetch(`/api/teacher/by-user/${usuarioLogado.id}/courses`),
    ])
      .then(([dashboardData, courseData]) => {
        if (cancelled) return;
        setDashboard(dashboardData);
        setCourses(Array.isArray(courseData) ? courseData : []);
      })
      .catch((error) => {
        console.error("Erro ao carregar home do professor:", error);
        if (!cancelled) {
          setDashboard(null);
          setCourses([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [usuarioLogado?.id]);

  const summary = dashboard?.summary;
  const pendingReviews = (dashboard?.pendingReviews ?? []).slice(0, 3);
  const upcomingSessions = (dashboard?.upcomingSessions ?? []).slice(0, 4);
  const classesOverview = (dashboard?.classesOverview ?? []).slice(0, 4);
  const pendingCount = summary?.pendingReviews || 0;
  const upcomingCount = summary?.upcomingCommitments || 0;

  const statusMessage = loading
    ? "Preparando sua sala de trabalho..."
    : pendingCount === 0 && upcomingCount === 0
      ? "Agenda leve por agora. Quando surgirem encontros ou envios, eles aparecem aqui."
      : pendingCount > 0
        ? `Você tem ${pendingCount} ${pendingCount === 1 ? "correção" : "correções"} esperando. Dá para começar por elas.`
        : "Tem encontro pela frente nesta semana. A agenda está um pouco mais abaixo.";

  return (
    <section className="px-2 py-6 sm:px-4 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <StaffWelcomeBanner
          eyebrow="Área do professor"
          description="Que bom ter você por aqui. Esta é a sua sala de entrada: turmas, correções e o que vem pela frente."
          statusMessage={statusMessage}
          action={{ to: "/professor/dashboard-professor", label: "Abrir dashboard" }}
          image="/images/coursehub-hero-green.webp"
          imageAlt="Sala de aula moderna com mesas, cadeiras e quadro ao fundo"
        />

        {loading ? (
          <p className="text-gray-600">Carregando resumo...</p>
        ) : (
          <>
            <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard title="Turmas ativas" value={summary?.activeClasses ?? 0} to="/professor/minhas-turmas" />
              <StatCard title="Alunos acompanhados" value={summary?.uniqueActiveStudents ?? 0} color="green" />
              <StatCard
                title="Correções pendentes"
                value={summary?.pendingReviews ?? 0}
                color={summary?.pendingReviews > 0 ? "yellow" : "blue"}
                to="/professor/atividades"
              />
              <StatCard
                title="Compromissos (7 dias)"
                value={summary?.upcomingCommitments ?? 0}
                color="purple"
                to="/professor/calendario"
              />
            </section>

            <section className="mt-10 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold text-gray-900">Próximos encontros</h2>
                  <Link to="/professor/encontros" className="text-sm font-semibold text-blue-600">
                    Ver agenda
                  </Link>
                </div>
                {upcomingSessions.length === 0 ? (
                  <div className="mt-5 flex min-h-[170px] flex-col items-center justify-center rounded-2xl bg-sky-50/80 px-6 text-center">
                    <CalendarDays className="h-8 w-8 text-sky-600" aria-hidden="true" />
                    <p className="mt-3 font-medium text-slate-800">Semana mais livre</p>
                    <p className="mt-1 max-w-sm text-sm text-slate-500">
                      Nenhum encontro nos próximos 7 dias. Quando a secretaria agendar, aparece aqui.
                    </p>
                  </div>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {upcomingSessions.map((session) => (
                      <li key={session.sessionId}>
                        <Link
                          to={session.deepLink || "/professor/encontros"}
                          className="block rounded-xl bg-gray-50 px-4 py-3 transition hover:bg-gray-100"
                        >
                          <p className="font-semibold text-gray-900">{session.title}</p>
                          <p className="mt-1 text-sm text-gray-500">
                            {session.className}
                            {session.sessionDate ? ` · ${formatSessionDate(session.sessionDate)}` : ""}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold text-gray-900">Correções pendentes</h2>
                  <Link to="/professor/avaliacoes" className="text-sm font-semibold text-blue-600">
                    Ver filas
                  </Link>
                </div>
                {pendingReviews.length === 0 ? (
                  <div className="mt-5 flex min-h-[170px] flex-col items-center justify-center rounded-2xl bg-emerald-50/80 px-6 text-center">
                    <ClipboardCheck className="h-8 w-8 text-emerald-600" aria-hidden="true" />
                    <p className="mt-3 font-medium text-slate-800">Tudo em dia</p>
                    <p className="mt-1 max-w-sm text-sm text-slate-500">
                      Nenhuma correção na fila. Bom momento para olhar materiais ou a frequência das turmas.
                    </p>
                  </div>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {pendingReviews.map((task) => (
                      <li key={task.activityId}>
                        <Link
                          to={task.deepLink}
                          className="block rounded-xl bg-gray-50 px-4 py-3 transition hover:bg-gray-100"
                        >
                          <p className="font-semibold text-gray-900">{task.title}</p>
                          <p className="mt-1 text-sm text-gray-500">
                            {task.courseName}
                            {task.pendingCount ? ` · ${task.pendingCount} envio(s)` : ""}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </>
        )}

        <section className="mt-10">
          <h2 className="text-xl font-bold text-gray-900">Atalhos</h2>
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

        <section className="mt-10">
          <h2 className="text-xl font-bold text-gray-900">Meus cursos</h2>
          <p className="mt-1 text-sm text-gray-500">
            {courses.length > 0
              ? "Cursos em que você leciona, com turma e alunos ativos."
              : "Quando um curso for atribuído a você, ele aparece aqui com a imagem e o número de alunos."}
          </p>
          {courses.length === 0 ? (
            <div className="mt-5 flex min-h-[180px] flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-white px-6 text-center">
              <BookOpen className="h-8 w-8 text-slate-400" aria-hidden="true" />
              <p className="mt-3 font-medium text-slate-800">Nenhum curso atribuído ainda</p>
              <p className="mt-1 max-w-md text-sm text-slate-500">
                Enquanto isso, você pode preparar encontros e olhar o calendário.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {courses.slice(0, 8).map((course) => (
                <Link
                  key={course.id}
                  to="/professor/minhas-turmas"
                  className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="aspect-[16/9] bg-gray-100">
                    <img
                      src={publicImageUrl(course.image_url)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                      onError={(event) => {
                        event.currentTarget.src = "/images/default-course.webp";
                      }}
                    />
                  </div>
                  <div className="p-4">
                    <p className="line-clamp-2 font-semibold text-gray-900">{course.name}</p>
                    <p className="mt-1 text-sm text-gray-500">
                      {course.total_students || 0} alunos ativos
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {!loading && classesOverview.length > 0 && (
          <section className="mt-10">
            <h2 className="text-xl font-bold text-gray-900">Turmas ativas</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {classesOverview.map((classItem) => (
                <Link
                  key={classItem.classId}
                  to={`/professor/turmas/${classItem.classId}`}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition hover:border-blue-200 hover:shadow-md"
                >
                  <p className="font-semibold text-slate-900">{classItem.className}</p>
                  <p className="mt-1 text-sm text-slate-500">{classItem.courseName}</p>
                  <p className="mt-3 text-sm font-medium text-blue-600">
                    {classItem.activeStudentCount} alunos
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </section>
  );
}