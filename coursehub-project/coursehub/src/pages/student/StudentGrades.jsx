import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { apiFetch } from "../../services/APIService";

import StudentManagementPage from "../../components/students/StudentManagementPage";
import StudentTable from "../../components/students/StudentTable";
import StudentStatusFilter from "../../components/students/StudentStatusFilter";
import StatusBadge from "../../components/ui/StatusBadge";
import TableActionButton from "../../components/ui/actions/TableActionButton";
import MobileExpandableCard from "../../components/ui/MobileExpandableCard";

const typeOptions = [
  {
    value: "",
    label: "Todas as notas",
  },
  {
    value: "activity",
    label: "Atividades",
  },
  {
    value: "exam",
    label: "Avaliações",
  },
];

function formatDate(dateString) {
  if (!dateString) {
    return "Sem data";
  }

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "Data inválida";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatNumber(value) {
  const number = Number(value);

  if (Number.isNaN(number)) {
    return "-";
  }

  return number.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function calculatePercentage(score, maxScore) {
  const normalizedScore = Number(score);
  const normalizedMaxScore = Number(maxScore);

  if (
    Number.isNaN(normalizedScore) ||
    Number.isNaN(normalizedMaxScore) ||
    normalizedMaxScore <= 0
  ) {
    return null;
  }

  return (normalizedScore / normalizedMaxScore) * 100;
}

function getPerformanceLabel(percentage) {
  if (percentage === null) {
    return {
      label: "-",
      className: "text-gray-500",
    };
  }

  if (percentage >= 90) {
    return {
      label: "Excelente",
      className: "text-green-700",
    };
  }

  if (percentage >= 70) {
    return {
      label: "Bom",
      className: "text-blue-700",
    };
  }

  if (percentage >= 60) {
    return {
      label: "Regular",
      className: "text-yellow-700",
    };
  }

  return {
    label: "Precisa melhorar",
    className: "text-red-700",
  };
}

export default function StudentGrades() {
  const { usuarioLogado } = useAuth();

  const [grades, setGrades] = useState([]);

  const [busca, setBusca] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!usuarioLogado?.id) return;

    async function loadGrades() {
      try {
        setLoading(true);
        setError("");

        const data = await apiFetch(
          `/api/students/by-user/${usuarioLogado.id}/grades`
        );

        setGrades(
          Array.isArray(data) ? data : []
        );
      } catch (error) {
        console.error(
          "Erro ao carregar notas do aluno:",
          error
        );

        /*
         * Nunca mantém notas antigas na tela após uma
         * resposta inválida (ex.: 403/404).
         */
        setGrades([]);

        setError(
          error.data?.message ||
            error.message ||
            "Não foi possível carregar suas notas."
        );
      } finally {
        setLoading(false);
      }
    }

    loadGrades();
  }, [usuarioLogado?.id]);

  const formattedGrades = useMemo(() => {
    return grades.map((grade) => {
      const score = Number(grade.score);
      const maxScore = Number(grade.max_score);

      const percentage = calculatePercentage(
        score,
        maxScore
      );

      return {
        id: grade.id,
        submissionId: grade.submission_id,
        activityId: grade.activity_id,

        title:
          grade.title ||
          "Atividade sem título",

        courseName:
          grade.course_name ||
          grade.course_title ||
          `Curso #${grade.course_id}`,

        activityKind:
          grade.activity_kind ||
          "activity",

        score,
        maxScore,
        percentage,

        feedback: grade.feedback,
        gradedAt: grade.graded_at,

        status:
          grade.status ||
          grade.submission_status ||
          "graded",

        original: grade,
      };
    });
  }, [grades]);

  const filteredGrades = useMemo(() => {
    const term = busca
      .trim()
      .toLowerCase();

    return formattedGrades.filter((grade) => {
      const matchesSearch =
        !term ||
        grade.title
          .toLowerCase()
          .includes(term) ||
        grade.courseName
          .toLowerCase()
          .includes(term);

      const matchesType =
        !typeFilter ||
        grade.activityKind === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [
    formattedGrades,
    busca,
    typeFilter,
  ]);

  const stats = useMemo(() => {
    const validPercentages =
      formattedGrades
        .map((grade) => grade.percentage)
        .filter(
          (percentage) =>
            percentage !== null &&
            !Number.isNaN(percentage)
        );

    const averagePercentage =
      validPercentages.length > 0
        ? validPercentages.reduce(
            (total, percentage) =>
              total + percentage,
            0
          ) / validPercentages.length
        : null;

    const normalizedAverage =
      averagePercentage !== null
        ? averagePercentage / 10
        : null;

    const activitiesCount =
      formattedGrades.filter(
        (grade) =>
          grade.activityKind === "activity"
      ).length;

    const examsCount =
      formattedGrades.filter(
        (grade) =>
          grade.activityKind === "exam"
      ).length;

    return [
      {
        title: "Notas lançadas",
        value: formattedGrades.length,
        color: "blue",
      },
      {
        title: "Média geral",
        value:
          normalizedAverage !== null
            ? normalizedAverage.toFixed(1)
            : "-",
        color: "purple",
      },
      {
        title: "Atividades corrigidas",
        value: activitiesCount,
        color: "green",
      },
      {
        title: "Avaliações corrigidas",
        value: examsCount,
        color: "yellow",
      },
    ];
  }, [formattedGrades]);

  const columns = [
    {
      key: "title",
      label: "Atividade / Avaliação",
    },
    {
      key: "course",
      label: "Curso",
    },
    {
      key: "type",
      label: "Tipo",
    },
    {
      key: "score",
      label: "Nota",
      align: "right",
    },
    {
      key: "performance",
      label: "Aproveitamento",
      align: "right",
    },
    {
      key: "date",
      label: "Corrigida em",
    },
    {
      key: "status",
      label: "Status",
    },
    {
      key: "actions",
      label: "Ações",
      align: "right",
    },
  ];

  return (
    <StudentManagementPage
      title="Minhas Notas"
      description="Acompanhe seu desempenho, consulte notas e acesse os feedbacks das atividades e avaliações corrigidas."
      stats={stats}
      tableTitle="Histórico de notas"
      tableActions={
        <StudentStatusFilter
          value={typeFilter}
          onChange={setTypeFilter}
          options={typeOptions}
        />
      }
      searchValue={busca}
      onSearchChange={setBusca}
      searchPlaceholder="Buscar nota, atividade ou curso..."
      backTo="/aluno/dashboard-aluno"
      backLabel="Voltar ao dashboard"
    >
      {loading && (
        <p className="py-8 text-center text-gray-500">
          Carregando notas...
        </p>
      )}

      {!loading && error && (
        <div className="py-8 text-center">
          <p className="text-red-500">
            {error}
          </p>
        </div>
      )}

      {!loading && !error && (
        <>
        <div className="hidden md:block">
        <StudentTable
          columns={columns}
          data={filteredGrades}
          emptyMessage="Nenhuma nota foi lançada até o momento."
          renderRow={(grade) => {
            const performance =
              getPerformanceLabel(
                grade.percentage
              );

            const typeLabel =
              grade.activityKind === "exam"
                ? "Avaliação"
                : "Atividade";

            return (
              <tr
                key={grade.id}
                className="border-b border-gray-100"
              >
                <td className="px-4 py-3">
                  <p className="text-xs font-semibold text-gray-900">
                    {grade.title}
                  </p>

                  <p className="mt-1 text-xs text-gray-500">
                    Registro #{grade.id}
                  </p>
                </td>

                <td className="px-4 py-3 text-xs text-gray-600">
                  {grade.courseName}
                </td>

                <td className="whitespace-nowrap px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      grade.activityKind === "exam"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {typeLabel}
                  </span>
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <p className="text-sm font-semibold tabular-nums text-gray-900">
                    {formatNumber(
                      grade.score
                    )}{" "}
                    /{" "}
                    {formatNumber(
                      grade.maxScore
                    )}
                  </p>
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <p className="text-sm font-semibold tabular-nums text-gray-900">
                    {grade.percentage !== null
                      ? `${grade.percentage.toFixed(
                          1
                        )}%`
                      : "-"}
                  </p>

                  <p
                    className={`mt-1 text-xs font-medium ${performance.className}`}
                  >
                    {performance.label}
                  </p>
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600">
                  {formatDate(
                    grade.gradedAt
                  )}
                </td>

                <td className="whitespace-nowrap px-4 py-3">
                  <StatusBadge
                    status={grade.status}
                    size="sm"
                  />
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {grade.submissionId && grade.activityId ? (
                    <TableActionButton
                      variant="accent"
                      size="sm"
                      to={`${
                        grade.activityKind === "exam"
                          ? "/aluno/avaliacoes"
                          : "/aluno/atividades"
                      }/${grade.activityId}?from=notas`}
                    >
                      Ver correção
                    </TableActionButton>
                  ) : (
                    <span className="text-sm text-gray-400">
                      Sem detalhes
                    </span>
                  )}
                </td>
              </tr>
            );
          }}
        />
        </div>

        {/* Mobile: cards com título e ação sempre visíveis; detalhes só ao expandir */}
        <div className="space-y-3 md:hidden">
          {filteredGrades.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Nenhuma nota foi lançada até o momento.
            </p>
          ) : (
            filteredGrades.map((grade) => {
              const performance = getPerformanceLabel(grade.percentage);

              const typeLabel =
                grade.activityKind === "exam" ? "Avaliação" : "Atividade";

              return (
                <MobileExpandableCard
                  key={grade.id}
                  title={grade.title}
                  subtitle={grade.courseName}
                  badge={<StatusBadge status={grade.status} size="sm" />}
                  primaryAction={
                    grade.submissionId && grade.activityId ? (
                      <TableActionButton
                        variant="accent"
                        size="md"
                        className="w-full"
                        to={`${
                          grade.activityKind === "exam"
                            ? "/aluno/avaliacoes"
                            : "/aluno/atividades"
                        }/${grade.activityId}?from=notas`}
                      >
                        Ver correção
                      </TableActionButton>
                    ) : (
                      <span className="text-sm text-gray-400">Sem detalhes</span>
                    )
                  }
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Tipo</span>
                    <span className="font-medium text-gray-900">{typeLabel}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Nota</span>
                    <span className="font-medium text-gray-900">
                      {formatNumber(grade.score)} / {formatNumber(grade.maxScore)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Aproveitamento</span>
                    <span className={`font-medium ${performance.className}`}>
                      {grade.percentage !== null
                        ? `${grade.percentage.toFixed(1)}% · ${performance.label}`
                        : "-"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Corrigida em</span>
                    <span className="font-medium text-gray-900">
                      {formatDate(grade.gradedAt)}
                    </span>
                  </div>
                </MobileExpandableCard>
              );
            })
          )}
        </div>
        </>
      )}
    </StudentManagementPage>
  );
}