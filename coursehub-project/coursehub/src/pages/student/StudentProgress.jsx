import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Link,
  useNavigate,
} from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";
import { apiFetch } from "../../services/APIService";
import { publicImageUrl } from "../../utils/publicImageUrl";

import StudentManagementPage from "../../components/students/StudentManagementPage";
import StatusBadge from "../../components/ui/StatusBadge";
import ProgressDonutChart from "../../components/charts/ProgressDonutChart";
import {
  CONTENT_CHART_COLORS as contentChartColors,
  ACADEMIC_CHART_COLORS as academicChartColors,
  ATTENDANCE_CHART_COLORS as attendanceChartColors,
} from "../../components/charts/progressChartColors";

/*
 * Converte um valor para número com fallback seguro.
 */
function normalizeNumber(
  value,
  fallback = 0
) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

/*
 * Impede que percentuais menores que zero ou maiores
 * que cem sejam utilizados pela interface.
 */
function clampPercentage(value) {
  const percentage =
    normalizeNumber(value);

  return Math.min(
    Math.max(percentage, 0),
    100
  );
}

function formatPercentage(value) {
  return `${clampPercentage(value).toFixed(
    0
  )}%`;
}

function formatAttendanceRate(value) {
  if (value === null || value === undefined) {
    return "—";
  }

  return formatPercentage(value);
}

function formatGrade(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "-";
  }

  const grade = Number(value);

  if (!Number.isFinite(grade)) {
    return "-";
  }

  return grade.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function formatDate(dateString) {
  if (!dateString) {
    return "Nenhum acesso registrado";
  }

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "Data inválida";
  }

  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }
  ).format(date);
}

/*
 * Determina o status geral de um curso pelo percentual
 * de conteúdos concluídos.
 */
function getCourseProgressStatus(
  progressPercentage,
  totalContents = 0
) {
  const percentage = clampPercentage(
    progressPercentage
  );

  if (
    totalContents > 0 &&
    percentage >= 100
  ) {
    return "completed";
  }

  if (percentage > 0) {
    return "in_progress";
  }

  return "not_started";
}

function getCourseActionLabel(status) {
  if (status === "completed") {
    return "Revisar curso";
  }

  if (status === "in_progress") {
    return "Continuar estudando";
  }

  return "Começar curso";
}

/*
 * Barra reutilizável utilizada para:
 * - progresso de conteúdo;
 * - progresso acadêmico.
 */
function ProgressBar({
  value,
  label,
  completed,
  total,
  tone = "blue",
}) {
  const percentage =
    clampPercentage(value);

  const progressColor =
    tone === "green"
      ? "bg-green-500"
      : tone === "purple"
        ? "bg-purple-500"
        : "bg-blue-600";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-800">
          {label}
        </p>

        <p className="text-sm font-bold text-gray-900">
          {completed} de {total}
        </p>
      </div>

      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
          style={{
            width: `${percentage}%`,
          }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-4 text-xs text-gray-500">
        <span>
          {formatPercentage(percentage)}
        </span>

        <span>
          {total > 0
            ? `${Math.max(
                total - completed,
                0
              )} restantes`
            : "Nenhum item disponível"}
        </span>
      </div>
    </div>
  );
}

/*
 * Card detalhado de um curso.
 *
 * Ele continua exibindo conteúdo e progresso acadêmico
 * separadamente, mesmo quando o usuário está vendo todos
 * os cursos.
 */
function CourseProgressCard({
  course,
}) {
  const content =
    course.content_progress || {};

  const academic =
    course.academic_progress || {};

  const contentTotal =
    normalizeNumber(
      content.total_contents
    );

  const contentCompleted =
    normalizeNumber(
      content.completed_contents
    );

  const contentPercentage =
    content.progress_percentage ??
    (contentTotal > 0
      ? (contentCompleted /
          contentTotal) *
        100
      : 0);

  const academicTotal =
    normalizeNumber(
      academic.total_items
    );

  const academicDelivered =
    normalizeNumber(
      academic.delivered_items
    );

  const academicPercentage =
    academic.progress_percentage ??
    (academicTotal > 0
      ? (academicDelivered /
          academicTotal) *
        100
      : 0);

  const status =
    course.progress_status ||
    getCourseProgressStatus(
      contentPercentage,
      contentTotal
    );

 const courseLink =
  course.next_content_id
    ? `/aluno/dashboard-aluno/courses/${course.course_id}:${course.next_content_id}`
    : `/aluno/dashboard-aluno/courses/${course.course_id}`;

  return (
    <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md">
      <div className="grid lg:grid-cols-[220px_1fr]">
        <div className="min-h-44 bg-gray-100">
          <img
            src={
              publicImageUrl(course.image_url)
            }
            alt={course.course_title}
            loading="lazy"
            decoding="async"
            className="h-full min-h-44 w-full object-cover"
            onError={(event) => {
              event.currentTarget.src =
                "/images/default-course.webp";
            }}
          />
        </div>

        <div className="p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              {course.category && (
                <p className="text-xs font-bold uppercase tracking-wide text-blue-600">
                  {course.category}
                </p>
              )}

              <h3 className="mt-1 text-xl font-bold text-gray-950">
                {course.course_title}
              </h3>

              <p className="mt-2 text-sm text-gray-500">
                Último acesso:{" "}
                {formatDate(
                  course.last_accessed_at
                )}
              </p>
            </div>

            <StatusBadge status={status} />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <ProgressBar
              label="Progresso de conteúdo"
              completed={contentCompleted}
              total={contentTotal}
              value={contentPercentage}
              tone="blue"
            />

            <ProgressBar
              label="Progresso acadêmico"
              completed={academicDelivered}
              total={academicTotal}
              value={academicPercentage}
              tone="green"
            />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-blue-50 px-3 py-3">
              <p className="text-xs font-medium text-blue-700">
                Em andamento
              </p>

              <p className="mt-1 text-lg font-bold text-blue-950">
                {normalizeNumber(
                  content.in_progress_contents
                )}
              </p>
            </div>

            <div className="rounded-xl bg-green-50 px-3 py-3">
              <p className="text-xs font-medium text-green-700">
                Corrigidas
              </p>

              <p className="mt-1 text-lg font-bold text-green-950">
                {normalizeNumber(
                  academic.graded_items
                )}
              </p>
            </div>

            <div className="rounded-xl bg-yellow-50 px-3 py-3">
              <p className="text-xs font-medium text-yellow-700">
                Pendentes
              </p>

              <p className="mt-1 text-lg font-bold text-yellow-950">
                {normalizeNumber(
                  academic.pending_items
                )}
              </p>
            </div>

            <div className="rounded-xl bg-purple-50 px-3 py-3">
              <p className="text-xs font-medium text-purple-700">
                Média
              </p>

              <p className="mt-1 text-lg font-bold text-purple-950">
                {formatGrade(
                  academic.average_grade
                )}
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-5">
            <div>
              {course.next_content_title ? (
                <>
                  <p className="text-xs text-gray-500">
                    Próximo conteúdo
                  </p>

                  <p className="mt-1 text-sm font-semibold text-gray-800">
                    {course.next_content_title}
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-500">
                  Nenhum conteúdo pendente.
                </p>
              )}
            </div>

            <Link
              to={courseLink}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              {getCourseActionLabel(status)}
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function AchievementCard({
  title,
  description,
  icon,
  tone = "blue",
}) {
  const toneClasses = {
    blue:
      "border-blue-100 bg-blue-50 text-blue-700",
    green:
      "border-green-100 bg-green-50 text-green-700",
    yellow:
      "border-yellow-100 bg-yellow-50 text-yellow-700",
    purple:
      "border-purple-100 bg-purple-50 text-purple-700",
  };

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-xl border text-xl ${
          toneClasses[tone] ||
          toneClasses.blue
        }`}
      >
        {icon}
      </div>

      <h3 className="mt-4 font-bold text-gray-900">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-6 text-gray-500">
        {description}
      </p>
    </article>
  );
}

/*
 * As conquistas agora recebem o resumo ativo.
 *
 * Portanto:
 * - em "Todos os cursos", reconhecem a jornada global;
 * - em um curso específico, reconhecem o desempenho
 *   daquele curso.
 */
function buildAchievements(
  activeSummary,
  selectedCourse
) {
  const achievements = [];

  const scopeLabel = selectedCourse
    ? `em ${selectedCourse.course_title}`
    : "nos seus cursos";

  if (
    activeSummary.completedContents >= 1
  ) {
    achievements.push({
      key: "first-content",
      title: "Primeiro passo",
      description: `Você já concluiu conteúdos ${scopeLabel}. Toda jornada começa com uma primeira etapa.`,
      icon: "✓",
      tone: "blue",
    });
  }

  if (
    activeSummary.completedContents >= 5
  ) {
    achievements.push({
      key: "consistent-progress",
      title: "Bom ritmo",
      description: `Você concluiu pelo menos cinco conteúdos ${scopeLabel} e está construindo uma boa rotina.`,
      icon: "↗",
      tone: "green",
    });
  }

  if (
    activeSummary.contentPercentage >=
      50 &&
    activeSummary.contentPercentage <
      100
  ) {
    achievements.push({
      key: "halfway",
      title: "Metade do caminho",
      description: selectedCourse
        ? `Você já concluiu pelo menos metade dos conteúdos de ${selectedCourse.course_title}.`
        : "Você já completou pelo menos metade dos conteúdos disponíveis.",
      icon: "★",
      tone: "purple",
    });
  }

  if (
    activeSummary.totalContents > 0 &&
    activeSummary.contentPercentage >=
      100
  ) {
    achievements.push({
      key: "completed-content",
      title: selectedCourse
        ? "Curso concluído"
        : "Conteúdos concluídos",
      description: selectedCourse
        ? `Parabéns! Você concluiu todos os conteúdos obrigatórios de ${selectedCourse.course_title}.`
        : "Parabéns! Você concluiu todos os conteúdos obrigatórios disponíveis.",
      icon: "🏆",
      tone: "green",
    });
  }

  if (
    activeSummary.averageGrade >= 9
  ) {
    achievements.push({
      key: "excellent-grade",
      title: "Excelente desempenho",
      description: selectedCourse
        ? `Sua média em ${selectedCourse.course_title} está acima de 9,0.`
        : "Sua média acadêmica geral está acima de 9,0.",
      icon: "✦",
      tone: "yellow",
    });
  }

  if (
    activeSummary.attendanceRate !==
      null &&
    activeSummary.attendanceRate >= 90
  ) {
    achievements.push({
      key: "excellent-attendance",
      title: "Frequência exemplar",
      description: selectedCourse
        ? `Sua frequência em ${selectedCourse.course_title} está acima de 90%.`
        : "Sua frequência geral está acima de 90%.",
      icon: "📅",
      tone: "blue",
    });
  }

  if (
    activeSummary.totalAcademicItems > 0 &&
    activeSummary.pendingAcademicItems ===
      0
  ) {
    achievements.push({
      key: "everything-up-to-date",
      title: "Tudo em dia",
      description: selectedCourse
        ? `Você realizou todas as atividades e avaliações disponíveis em ${selectedCourse.course_title}.`
        : "Você realizou todas as atividades e avaliações disponíveis.",
      icon: "✓",
      tone: "green",
    });
  }

  if (achievements.length === 0) {
    achievements.push({
      key: "begin-journey",
      title: "Sua jornada está começando",
      description: selectedCourse
        ? `Acesse um conteúdo de ${selectedCourse.course_title} para começar a registrar sua evolução.`
        : "Acesse um conteúdo ou realize uma atividade para começar a acompanhar suas conquistas.",
      icon: "→",
      tone: "blue",
    });
  }

  return achievements.slice(0, 4);
}

export default function StudentProgress() {
  const { usuarioLogado } =
    useAuth();

  const navigate = useNavigate();

  const [overview, setOverview] =
    useState(null);

  /*
   * Busca textual.
   *
   * Ela filtra apenas os cards exibidos na seção
   * "Evolução por curso".
   */
  const [busca, setBusca] =
    useState("");

  /*
   * Escopo analítico.
   *
   * String vazia:
   * - mostra todos os cursos.
   *
   * ID preenchido:
   * - StatCards, roscas, barras e conquistas passam
   *   a representar apenas o curso escolhido.
   */
  const [
    selectedCourseId,
    setSelectedCourseId,
  ] = useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  useEffect(() => {
    if (!usuarioLogado?.id) {
      return;
    }

    async function loadProgressOverview() {
      try {
        setLoading(true);
        setError("");

        const data = await apiFetch(
          `/api/students/by-user/${usuarioLogado.id}/progress-overview`
        );

        setOverview(data || null);
      } catch (requestError) {
        console.error(
          "Erro ao carregar progresso do aluno:",
          requestError
        );

        setError(
          requestError.message ||
            "Não foi possível carregar seu progresso."
        );
      } finally {
        setLoading(false);
      }
    }

    loadProgressOverview();
  }, [usuarioLogado?.id]);

  /*
   * Normaliza a lista de cursos recebida da API.
   */
  const courses = useMemo(() => {
    return Array.isArray(
      overview?.courses
    )
      ? overview.courses
      : [];
  }, [overview]);

  /*
   * Resumo global da rota progress-overview.
   */
  const globalSummary = useMemo(() => {
    const apiSummary =
      overview?.summary || {};

    const totalContents =
      normalizeNumber(
        apiSummary.total_contents
      );

    const completedContents =
      normalizeNumber(
        apiSummary.completed_contents
      );

    const inProgressContents =
      normalizeNumber(
        apiSummary.in_progress_contents
      );

    const notStartedContents =
      normalizeNumber(
        apiSummary.not_started_contents
      );

    const totalAcademicItems =
      normalizeNumber(
        apiSummary.total_academic_items
      );

    const submittedAcademicItems =
      normalizeNumber(
        apiSummary.submitted_academic_items
      );

    const gradedAcademicItems =
      normalizeNumber(
        apiSummary.graded_academic_items
      );

    const pendingAcademicItems =
      normalizeNumber(
        apiSummary.pending_academic_items
      );

    const returnedAcademicItems =
      normalizeNumber(
        apiSummary.returned_academic_items
      );

    const deliveredAcademicItems =
      normalizeNumber(
        apiSummary.delivered_academic_items,
        submittedAcademicItems +
          gradedAcademicItems +
          returnedAcademicItems
      );

    const contentPercentage =
      apiSummary.content_progress_percentage ??
      (totalContents > 0
        ? (completedContents /
            totalContents) *
          100
        : 0);

    const academicPercentage =
      apiSummary.academic_progress_percentage ??
      (totalAcademicItems > 0
        ? (deliveredAcademicItems /
            totalAcademicItems) *
          100
        : 0);

    const totalAttendanceSessions =
      normalizeNumber(
        apiSummary.total_attendance_sessions
      );

    const attendancePresent =
      normalizeNumber(
        apiSummary.attendance_present
      );

    const attendanceAbsent =
      normalizeNumber(
        apiSummary.attendance_absent
      );

    const attendanceLate =
      normalizeNumber(
        apiSummary.attendance_late
      );

    const attendanceExcused =
      normalizeNumber(
        apiSummary.attendance_excused
      );

    return {
      scope: "all",
      title: "Todos os cursos",

      totalContents,
      completedContents,
      inProgressContents,
      notStartedContents,

      totalAcademicItems,
      submittedAcademicItems,
      gradedAcademicItems,
      pendingAcademicItems,
      returnedAcademicItems,
      deliveredAcademicItems,

      contentPercentage:
        clampPercentage(
          contentPercentage
        ),

      academicPercentage:
        clampPercentage(
          academicPercentage
        ),

      averageGrade:
        apiSummary.average_grade !==
          null &&
        apiSummary.average_grade !==
          undefined
          ? normalizeNumber(
              apiSummary.average_grade
            )
          : null,

      totalAttendanceSessions,
      attendancePresent,
      attendanceAbsent,
      attendanceLate,
      attendanceExcused,

      attendanceRate:
        apiSummary.attendance_rate !==
          null &&
        apiSummary.attendance_rate !==
          undefined
          ? normalizeNumber(
              apiSummary.attendance_rate
            )
          : null,
    };
  }, [overview]);

  /*
   * Cria as opções do select dinamicamente a partir
   * dos cursos em que o aluno está matriculado.
   */
  const courseOptions = useMemo(() => {
    return [
      {
        value: "",
        label: "Todos os cursos",
      },

      ...courses.map((course) => ({
        value: String(
          course.course_id
        ),

        label:
          course.course_title ||
          `Curso #${course.course_id}`,
      })),
    ];
  }, [courses]);

  /*
   * Encontra o objeto completo do curso selecionado.
   */
  const selectedCourse = useMemo(() => {
    if (!selectedCourseId) {
      return null;
    }

    return (
      courses.find(
        (course) =>
          String(course.course_id) ===
          String(selectedCourseId)
      ) || null
    );
  }, [
    courses,
    selectedCourseId,
  ]);

  /*
   * Cria o resumo que alimenta a página.
   *
   * Sem curso selecionado:
   * - utiliza o resumo global.
   *
   * Com curso selecionado:
   * - utiliza content_progress;
   * - utiliza academic_progress;
   * - calcula apenas dados daquele curso.
   */
  const activeSummary = useMemo(() => {
    if (!selectedCourse) {
      return globalSummary;
    }

    const content =
      selectedCourse.content_progress ||
      {};

    const academic =
      selectedCourse.academic_progress ||
      {};

    const attendance =
      selectedCourse.attendance_progress ||
      {};

    const totalContents =
      normalizeNumber(
        content.total_contents
      );

    const completedContents =
      normalizeNumber(
        content.completed_contents
      );

    const inProgressContents =
      normalizeNumber(
        content.in_progress_contents
      );

    const notStartedContents =
      normalizeNumber(
        content.not_started_contents
      );

    const totalAcademicItems =
      normalizeNumber(
        academic.total_items
      );

    const deliveredAcademicItems =
      normalizeNumber(
        academic.delivered_items
      );

    const submittedAcademicItems =
      normalizeNumber(
        academic.submitted_items
      );

    const gradedAcademicItems =
      normalizeNumber(
        academic.graded_items
      );

    const pendingAcademicItems =
      normalizeNumber(
        academic.pending_items
      );

    const returnedAcademicItems =
      normalizeNumber(
        academic.returned_items
      );

    const contentPercentage =
      content.progress_percentage ??
      (totalContents > 0
        ? (completedContents /
            totalContents) *
          100
        : 0);

    const academicPercentage =
      academic.progress_percentage ??
      (totalAcademicItems > 0
        ? (deliveredAcademicItems /
            totalAcademicItems) *
          100
        : 0);

    return {
      scope: "course",
      title:
        selectedCourse.course_title,

      totalContents,
      completedContents,
      inProgressContents,
      notStartedContents,

      totalAcademicItems,
      deliveredAcademicItems,
      submittedAcademicItems,
      gradedAcademicItems,
      pendingAcademicItems,
      returnedAcademicItems,

      contentPercentage:
        clampPercentage(
          contentPercentage
        ),

      academicPercentage:
        clampPercentage(
          academicPercentage
        ),

      averageGrade:
        academic.average_grade !==
          null &&
        academic.average_grade !==
          undefined
          ? normalizeNumber(
              academic.average_grade
            )
          : null,

      totalAttendanceSessions:
        normalizeNumber(
          attendance.total_sessions
        ),

      attendancePresent:
        normalizeNumber(
          attendance.present
        ),

      attendanceAbsent:
        normalizeNumber(
          attendance.absent
        ),

      attendanceLate:
        normalizeNumber(
          attendance.late
        ),

      attendanceExcused:
        normalizeNumber(
          attendance.excused
        ),

      attendanceRate:
        attendance.attendance_rate !==
          null &&
        attendance.attendance_rate !==
          undefined
          ? normalizeNumber(
              attendance.attendance_rate
            )
          : null,
    };
  }, [
    selectedCourse,
    globalSummary,
  ]);

  /*
   * Busca textual e seleção trabalham juntas.
   *
   * - busca: filtra pelo nome ou categoria;
   * - select: limita a lista ao curso escolhido.
   */
  const filteredCourses = useMemo(() => {
    const term = busca
      .trim()
      .toLowerCase();

    return courses.filter((course) => {
      const matchesSearch =
        !term ||
        course.course_title
          ?.toLowerCase()
          .includes(term) ||
        course.category
          ?.toLowerCase()
          .includes(term);

      const matchesSelectedCourse =
        !selectedCourseId ||
        String(course.course_id) ===
          String(selectedCourseId);

      return (
        matchesSearch &&
        matchesSelectedCourse
      );
    });
  }, [
    courses,
    busca,
    selectedCourseId,
  ]);

  /*
   * Dados da rosca de conteúdos.
   *
   * Reagem automaticamente ao activeSummary.
   */
  const contentChartData =
    useMemo(
      () => [
        {
          name: "Concluídos",
          value:
            activeSummary.completedContents,
        },
        {
          name: "Em andamento",
          value:
            activeSummary.inProgressContents,
        },
        {
          name: "Não iniciados",
          value:
            activeSummary.notStartedContents,
        },
      ],
      [activeSummary]
    );

  /*
   * Dados da rosca acadêmica.
   */
  const academicChartData =
    useMemo(
      () => [
        {
          name: "Corrigidas",
          value:
            activeSummary.gradedAcademicItems,
        },
        {
          name: "Aguardando correção",
          value:
            activeSummary.submittedAcademicItems,
        },
        {
          name: "Pendentes",
          value:
            activeSummary.pendingAcademicItems,
        },
        {
          name: "Devolvidas",
          value:
            activeSummary.returnedAcademicItems,
        },
      ],
      [activeSummary]
    );

  /*
   * Dados da rosca de frequência.
   */
  const attendanceChartData =
    useMemo(
      () => [
        {
          name: "Presente",
          value:
            activeSummary.attendancePresent,
        },
        {
          name: "Atrasado",
          value:
            activeSummary.attendanceLate,
        },
        {
          name: "Justificado",
          value:
            activeSummary.attendanceExcused,
        },
        {
          name: "Ausente",
          value:
            activeSummary.attendanceAbsent,
        },
      ],
      [activeSummary]
    );

  /*
   * Os StatCards também reagem ao escopo selecionado.
   */
  const stats = useMemo(
    () => [
      {
        title: selectedCourse
          ? "Progresso no curso"
          : "Progresso de conteúdo",

        value: formatPercentage(
          activeSummary.contentPercentage
        ),

        color: "blue",
      },
      {
        title: "Conteúdos concluídos",

        value:
          activeSummary.completedContents,

        color: "green",
      },
      {
        title: "Entregas realizadas",

        value:
          activeSummary.deliveredAcademicItems,

        color: "yellow",
      },
      {
        title: selectedCourse
          ? "Média no curso"
          : "Média geral",

        value: formatGrade(
          activeSummary.averageGrade
        ),

        color: "purple",
      },
    ],
    [
      activeSummary,
      selectedCourse,
    ]
  );

  /*
   * Conquistas adaptadas ao mesmo escopo dos gráficos.
   */
  const achievements = useMemo(
    () =>
      buildAchievements(
        activeSummary,
        selectedCourse
      ),
    [
      activeSummary,
      selectedCourse,
    ]
  );

 

  const quickActions = [
  {
    title: "Continuar estudando",
    description:
      "Retome o curso acessado mais recentemente.",

    onClick: () => {
      /*
       * Caso exista um curso selecionado,
       * continua especificamente nele.
       */
      if (selectedCourse) {
        const path =
          selectedCourse.next_content_id
            ? `/aluno/dashboard-aluno/courses/${selectedCourse.course_id}:${selectedCourse.next_content_id}`
            : `/aluno/dashboard-aluno/courses/${selectedCourse.course_id}`;

        navigate(path);
        return;
      }

      /*
       * Sem seleção, utiliza o continue_learning
       * calculado pela rota agregadora.
       */
      const nextCourse =
        overview?.continue_learning;

      if (nextCourse?.course_id) {
        const path =
          nextCourse.content_id
            ? `/aluno/dashboard-aluno/courses/${nextCourse.course_id}:${nextCourse.content_id}`
            : `/aluno/dashboard-aluno/courses/${nextCourse.course_id}`;

        navigate(path);
        return;
      }

      navigate("/aluno/dashboard-aluno");
    },
  },

  {
    title: "Ver evolução por curso",
    description:
      "Veja a evolução do seu progresso em cada curso.",

    onClick: () => {
      document.getElementById("course-evolution").scrollIntoView({behavior: "smooth", block: "start"});   },
  },

  {
    title: "Minhas notas",
    description:
      "Consulte notas e feedbacks das atividades corrigidas.",

    onClick: () =>
      navigate("/aluno/notas"),
  },
];

  return (
    <StudentManagementPage
      title="Meu progresso"
      description="Acompanhe os conteúdos concluídos, suas entregas acadêmicas e sua evolução em cada curso."
      stats={stats}
      quickActions={quickActions}
      sectionTitle="Progresso por curso"
      sectionDescription="Selecione um curso para atualizar os gráficos e indicadores ou mantenha a visão geral de todos os cursos."
      sectionActions={
        /*
         * O select define o escopo analítico.
         *
         * As opções vêm diretamente dos cursos retornados
         * por progress-overview.
         */
        <label className="block">
          <span className="sr-only">
            Selecionar curso
          </span>

          <select
            value={selectedCourseId}
            onChange={(event) => {
              setSelectedCourseId(
                event.target.value
              );

              /*
               * Limpa a busca quando o curso muda para
               * evitar combinações confusas de filtros.
               */
              setBusca("");
            }}
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:w-72"
          >
            {courseOptions.map(
              (option) => (
                <option
                  key={
                    option.value || "all"
                  }
                  value={option.value}
                >
                  {option.label}
                </option>
              )
            )}
          </select>
        </label>
      }
      searchValue={busca}
      onSearchChange={setBusca}
      searchPlaceholder="Buscar curso por nome ou categoria..."
      backTo="/aluno/dashboard-aluno"
      backLabel="Voltar ao dashboard"
    >
      {loading && (
        <p className="py-10 text-center text-gray-500">
          Carregando seu progresso...
        </p>
      )}

      {!loading && error && (
        <div className="py-10 text-center">
          <p className="font-medium text-red-600">
            {error}
          </p>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-10 pb-6">
          {/*
           * Aviso de escopo.
           *
           * Ele aparece apenas quando um curso foi
           * selecionado e evita que o aluno confunda
           * os números individuais com os dados globais.
           */}
          {selectedCourse && (
            <div className="flex justify-end">
              

              <button
                type="button"
                onClick={() => {
                  setSelectedCourseId("");
                  setBusca("");
                }}
                className="shrink-0 rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
              >
                Ver todos os cursos
              </button>
            </div>
          )}

          <section>
            <div className="mb-5">
              <h2 className="text-xl font-bold text-gray-950">
                {selectedCourse
                  ? `Visão geral — ${selectedCourse.course_title}`
                  : "Visão geral"}
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                {selectedCourse
                  ? "Veja como os conteúdos e as entregas deste curso estão distribuídos."
                  : "Veja como seus estudos e suas entregas estão distribuídos em todos os cursos."}
              </p>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <ProgressDonutChart
                title="Progresso de conteúdo"
                description={
                  selectedCourse
                    ? `Distribuição dos conteúdos de ${selectedCourse.course_title}.`
                    : "Distribuição dos conteúdos de todos os seus cursos."
                }
                centerValue={formatPercentage(
                  activeSummary.contentPercentage
                )}
                centerLabel="concluído"
                data={contentChartData}
                colors={contentChartColors}
              />

              <ProgressDonutChart
                title="Atividades e avaliações"
                description={
                  selectedCourse
                    ? `Situação das entregas de ${selectedCourse.course_title}.`
                    : "Situação das entregas acadêmicas em todos os cursos."
                }
                centerValue={`${activeSummary.deliveredAcademicItems}/${activeSummary.totalAcademicItems}`}
                centerLabel="entregues"
                data={academicChartData}
                colors={academicChartColors}
              />

              <ProgressDonutChart
                title="Frequência"
                description={
                  selectedCourse
                    ? `Presenças registradas em ${selectedCourse.course_title}.`
                    : "Presenças registradas em todos os cursos com turma."
                }
                centerValue={formatAttendanceRate(
                  activeSummary.attendanceRate
                )}
                centerLabel="presença"
                data={attendanceChartData}
                colors={attendanceChartColors}
              />
            </div>
          </section>

          {selectedCourse ?
          []
          :
          <section>
            <div className="grid gap-5 lg:grid-cols-2">
              <article className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                <h3 className="font-bold text-gray-900">
                  Progresso de conteúdo
                </h3>

                <p className="mt-1 text-sm leading-6 text-gray-500">
                  {selectedCourse
                    ? `Quantidade de conteúdos obrigatórios concluídos em ${selectedCourse.course_title}.`
                    : "Quantidade de conteúdos obrigatórios concluídos em todos os cursos."}
                </p>

                <div className="mt-5">
                  <ProgressBar
                    label="Conteúdos concluídos"
                    completed={
                      activeSummary.completedContents
                    }
                    total={
                      activeSummary.totalContents
                    }
                    value={
                      activeSummary.contentPercentage
                    }
                    tone="blue"
                  />
                </div>
              </article>

              <article className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                <h3 className="font-bold text-gray-900">
                  Progresso acadêmico
                </h3>

                <p className="mt-1 text-sm leading-6 text-gray-500">
                  {selectedCourse
                    ? `Quantidade de atividades e avaliações entregues em ${selectedCourse.course_title}.`
                    : "Quantidade de atividades e avaliações entregues em todos os cursos."}
                </p>

                <div className="mt-5">
                  <ProgressBar
                    label="Atividades e avaliações entregues"
                    completed={
                      activeSummary.deliveredAcademicItems
                    }
                    total={
                      activeSummary.totalAcademicItems
                    }
                    value={
                      activeSummary.academicPercentage
                    }
                    tone="green"
                  />
                </div>
              </article>
            </div>
          </section>
          
}
          <section className="scroll-mt-34" id="course-evolution">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-gray-950">
                  {selectedCourse
                    ? "Detalhes do curso"
                    : "Evolução por curso"}
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  {selectedCourse
                    ? "Consulte os próximos passos e os indicadores detalhados deste curso."
                    : "Compare conteúdos, entregas, notas e próximos passos."}
                </p>
              </div>

              <p className="text-sm font-medium text-gray-500">
                {filteredCourses.length}{" "}
                {filteredCourses.length === 1
                  ? "curso"
                  : "cursos"}
              </p>
            </div>

            {filteredCourses.length ===
              0 && (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center">
                <p className="font-semibold text-gray-700">
                  Nenhum curso encontrado.
                </p>

                <p className="mt-2 text-sm text-gray-500">
                  Ajuste a busca ou selecione “Todos os cursos”.
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setBusca("");
                    setSelectedCourseId("");
                  }}
                  className="mt-5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  Limpar filtros
                </button>
              </div>
            )}

            <div className="space-y-5">
              {filteredCourses.map(
                (course) => (
                  <CourseProgressCard
                    key={course.course_id}
                    course={course}
                  />
                )
              )}
            </div>
          </section>

          <section>
            <div className="mb-5">
              <h2 className="text-xl font-bold text-gray-950">
                {selectedCourse
                  ? "Destaques neste curso"
                  : "Destaques da sua jornada"}
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                {selectedCourse
                  ? `Reconhecimentos baseados no seu progresso em ${selectedCourse.course_title}.`
                  : "Reconhecimentos baseados no seu progresso e desempenho geral."}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {achievements.map(
                (achievement) => (
                  <AchievementCard
                    key={achievement.key}
                    title={achievement.title}
                    description={
                      achievement.description
                    }
                    icon={achievement.icon}
                    tone={achievement.tone}
                  />
                )
              )}
            </div>
          </section>
        </div>
      )}
    </StudentManagementPage>
  );
}