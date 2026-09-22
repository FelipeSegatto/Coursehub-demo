import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, CalendarDays, ClipboardCheck } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import StaffWelcomeBanner from "../../components/StaffWelcomeBanner";
import { useCalendarEvents } from "../../hooks/useCalendarEvents";
import { apiFetch } from "../../services/APIService";
import useEnrollment from "../../services/EnrollmentService";
import useStudentProgress from "../../services/StudentProgressService";
import { addDaysToDateString, formatDisplayDate, todayDateString } from "../../utils/dateUtils";
import { publicImageUrl } from "../../utils/publicImageUrl";

const SHORTCUTS = [
  { to: "/aluno/meus-cursos", title: "Meus cursos", description: "Continue de onde parou e acompanhe o progresso de cada curso." },
  { to: "/aluno/atividades", title: "Atividades", description: "Tarefas, prazos e envios pendentes." },
  { to: "/aluno/avaliacoes", title: "Avaliações", description: "Provas e resultados das turmas em que você está." },
  { to: "/aluno/calendario", title: "Calendário", description: "Encontros, prazos e eventos da sua jornada." },
  { to: "/aluno/frequencia", title: "Frequência", description: "Presenças, faltas e atrasos das suas turmas." },
  { to: "/aluno/notas", title: "Notas", description: "Notas lançadas nas atividades e avaliações." },
];

function formatDay(value) {
  if (!value) return "";
  const day = String(value).slice(0, 10);
  return formatDisplayDate(day, { day: "2-digit", month: "short" }) || day;
}

function isPendingActivity(activity) {
  const status = activity.submission_status;
  return status !== "graded" && status !== "pending_review" && status !== "submitted";
}

function isOverdueActivity(activity) {
  if (Number(activity.is_overdue) === 1) return true;
  if (activity.submission_status) return false;
  if (!activity.due_date) return false;
  const due = new Date(activity.due_date);
  return !Number.isNaN(due.getTime()) && due < new Date();
}

function activityPath(activity) {
  return activity.activity_kind === "exam"
    ? `/aluno/avaliacoes/${activity.id}`
    : `/aluno/atividades/${activity.id}`;
}

function continueLearningPath(continueLearning, courses) {
  if (continueLearning?.course_id) {
    return continueLearning.content_id
      ? `/aluno/dashboard-aluno/courses/${continueLearning.course_id}:${continueLearning.content_id}`
      : `/aluno/dashboard-aluno/courses/${continueLearning.course_id}`;
  }

  if (courses[0]?.id) {
    return `/aluno/dashboard-aluno/courses/${courses[0].id}`;
  }

  return "/aluno/meus-cursos";
}

export default function StudentHome() {
  const { usuarioLogado } = useAuth();
  const { matriculas, loading: coursesLoading } = useEnrollment();
  const { overview, loading: progressLoading } = useStudentProgress(usuarioLogado?.id);

  const calendarRange = useMemo(() => {
    const from = todayDateString();
    return { from, to: addDaysToDateString(from, 7) };
  }, []);

  const { events: calendarEvents, loading: calendarLoading } = useCalendarEvents({
    role: "student",
    userId: usuarioLogado?.id,
    from: calendarRange.from,
    to: calendarRange.to,
  });

  const [activities, setActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    apiFetch("/api/students/by-user/activities")
      .then((data) => {
        if (!cancelled) setActivities(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        console.error("Erro ao carregar atividades da home do aluno:", error);
        if (!cancelled) setActivities([]);
      })
      .finally(() => {
        if (!cancelled) setActivitiesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const progressByCourseId = useMemo(() => {
    return new Map(
      (overview?.courses || []).map((course) => [
        Number(course.course_id),
        Number(course.content_progress?.progress_percentage || 0),
      ])
    );
  }, [overview]);

  const upcomingSessions = useMemo(() => {
    return calendarEvents
      .filter(
        (event) =>
          event.sourceType === "class_session" &&
          event.status !== "cancelled" &&
          event.startDate >= calendarRange.from
      )
      .sort((first, second) => {
        if (first.startDate !== second.startDate) {
          return first.startDate.localeCompare(second.startDate);
        }
        return String(first.startTime || "").localeCompare(String(second.startTime || ""));
      })
      .slice(0, 4);
  }, [calendarEvents, calendarRange.from]);

  const pendingActivities = useMemo(() => {
    return activities
      .filter(isPendingActivity)
      .sort((first, second) => {
        const firstOverdue = isOverdueActivity(first) ? 0 : 1;
        const secondOverdue = isOverdueActivity(second) ? 0 : 1;
        if (firstOverdue !== secondOverdue) return firstOverdue - secondOverdue;
        return String(first.due_date || "").localeCompare(String(second.due_date || ""));
      })
      .slice(0, 4);
  }, [activities]);

  const pendingCount = pendingActivities.length === 4
    ? activities.filter(isPendingActivity).length
    : pendingActivities.length;
  const overdueCount = activities.filter(isOverdueActivity).length;
  const nextSession = upcomingSessions[0];
  const continueLearning = overview?.continue_learning || null;
  const loading = coursesLoading || progressLoading;

  const statusMessage = loading
    ? "Preparando sua área de estudos..."
    : matriculas.length === 0
      ? "Você ainda não tem matrícula ativa. Quando um curso for liberado, ele aparece aqui com a imagem e o progresso."
      : overdueCount > 0
        ? `Há ${overdueCount} ${overdueCount === 1 ? "prazo vencido" : "prazos vencidos"}. Vale olhar as atividades.`
        : pendingCount > 0
          ? `Você tem ${pendingCount} ${pendingCount === 1 ? "atividade pendente" : "atividades pendentes"}. Dá para começar por elas.`
          : nextSession
            ? `Próximo encontro: ${nextSession.title}${nextSession.startDate ? ` · ${formatDay(nextSession.startDate)}` : ""}.`
            : "Tudo em dia por agora. Bom momento para continuar um curso ou olhar o calendário.";

  const heroAction = matriculas.length === 0
    ? { to: "/courses", label: "Ver cursos" }
    : { to: continueLearningPath(continueLearning, matriculas), label: "Continuar estudando" };

  return (
    <section className="px-2 py-6 sm:px-4 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <StaffWelcomeBanner
          eyebrow="Área do aluno"
          description="Esta é a sua área de estudos: cursos, atividades e o que vem pela frente."
          statusMessage={statusMessage}
          action={heroAction}
          image="/images/coursehub-hero-yellow.webp"
          imageAlt="Materiais de estudo e planejamento sobre fundo amarelo"
        />

        <section className="mt-2">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Meus cursos</h2>
              <p className="mt-1 text-sm text-gray-500">
                {matriculas.length > 0
                  ? "Cursos em que você está matriculado. Toque no card para abrir o conteúdo."
                  : "Quando uma matrícula for ativada, o curso aparece aqui com a imagem e o progresso."}
              </p>
            </div>
            {matriculas.length > 0 && (
              <Link to="/aluno/meus-cursos" className="shrink-0 text-sm font-semibold text-blue-600">
                Ver todos
              </Link>
            )}
          </div>

          {coursesLoading ? (
            <p className="mt-5 text-gray-600">Carregando seus cursos...</p>
          ) : matriculas.length === 0 ? (
            <div className="mt-5 flex min-h-[180px] flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-white px-6 text-center">
              <BookOpen className="h-8 w-8 text-slate-400" aria-hidden="true" />
              <p className="mt-3 font-medium text-slate-800">Nenhum curso ativo ainda</p>
              <p className="mt-1 max-w-md text-sm text-slate-500">
                Enquanto isso, você pode explorar o catálogo ou conversar com a secretaria pelo chat.
              </p>
              <Link
                to="/courses"
                className="mt-4 inline-flex rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Explorar cursos
              </Link>
            </div>
          ) : (
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {matriculas.slice(0, 8).map((course) => {
                const progress = progressByCourseId.get(Number(course.id));

                return (
                  <Link
                    key={course.id}
                    to={`/aluno/dashboard-aluno/courses/${course.id}`}
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
                      {course.category && (
                        <p className="text-sm font-semibold text-blue-600">{course.category}</p>
                      )}
                      <p className="mt-1 line-clamp-2 font-semibold text-gray-900">{course.name}</p>
                      <p className="mt-1 text-sm text-gray-500">
                        {progress == null
                          ? course.nivel || "Continuar estudos"
                          : `${Math.round(progress)}% concluído`}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-gray-900">Próximos encontros</h2>
              <Link to="/aluno/calendario" className="text-sm font-semibold text-blue-600">
                Ver calendário
              </Link>
            </div>
            {calendarLoading ? (
              <p className="mt-5 text-sm text-gray-500">Carregando agenda...</p>
            ) : upcomingSessions.length === 0 ? (
              <div className="mt-5 flex min-h-[170px] flex-col items-center justify-center rounded-2xl bg-sky-50/80 px-6 text-center">
                <CalendarDays className="h-8 w-8 text-sky-600" aria-hidden="true" />
                <p className="mt-3 font-medium text-slate-800">Semana mais livre</p>
                <p className="mt-1 max-w-sm text-sm text-slate-500">
                  Nenhum encontro nos próximos 7 dias. Quando a turma marcar aula, aparece aqui.
                </p>
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {upcomingSessions.map((session) => (
                  <li key={session.id}>
                    <Link
                      to="/aluno/calendario"
                      className="block rounded-xl bg-gray-50 px-4 py-3 transition hover:bg-gray-100"
                    >
                      <p className="font-semibold text-gray-900">{session.title}</p>
                      <p className="mt-1 text-sm text-gray-500">
                        {session.courseName || session.className || "Turma"}
                        {session.startDate ? ` · ${formatDay(session.startDate)}` : ""}
                        {session.startTime ? ` · ${session.startTime}` : ""}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-gray-900">Atividades pendentes</h2>
              <Link to="/aluno/atividades" className="text-sm font-semibold text-blue-600">
                Ver atividades
              </Link>
            </div>
            {activitiesLoading ? (
              <p className="mt-5 text-sm text-gray-500">Carregando atividades...</p>
            ) : pendingActivities.length === 0 ? (
              <div className="mt-5 flex min-h-[170px] flex-col items-center justify-center rounded-2xl bg-emerald-50/80 px-6 text-center">
                <ClipboardCheck className="h-8 w-8 text-emerald-600" aria-hidden="true" />
                <p className="mt-3 font-medium text-slate-800">Tudo em dia</p>
                <p className="mt-1 max-w-sm text-sm text-slate-500">
                  Nenhuma atividade esperando envio. Bom momento para continuar um curso ou olhar as notas.
                </p>
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {pendingActivities.map((activity) => (
                  <li key={activity.id}>
                    <Link
                      to={activityPath(activity)}
                      className="block rounded-xl bg-gray-50 px-4 py-3 transition hover:bg-gray-100"
                    >
                      <p className="font-semibold text-gray-900">{activity.title}</p>
                      <p className="mt-1 text-sm text-gray-500">
                        {activity.course_name || activity.course_title || "Curso"}
                        {activity.due_date ? ` · ${formatDay(activity.due_date)}` : ""}
                        {isOverdueActivity(activity) ? " · prazo vencido" : ""}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-bold text-gray-900">Atalhos</h2>
          <p className="mt-1 text-sm text-gray-500">
            Caminhos do dia a dia para seguir estudando.
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
