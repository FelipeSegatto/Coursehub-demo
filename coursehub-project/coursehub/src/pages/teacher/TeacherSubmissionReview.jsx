import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { apiFetch } from "../../services/APIService";

import SubmissionAnswerReviewCard from "../../components/submissions/SubmissionAnswerReviewCard";
import StatusBadge from "../../components/ui/StatusBadge";

function formatDate(dateString) {
  if (!dateString) return "Sem data";

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "Data inválida";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function formatScore(value) {
  const number = Number(value);

  if (Number.isNaN(number)) {
    return "0";
  }

  return number.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export default function TeacherSubmissionReview() {
  const { submissionId } = useParams();
  const { usuarioLogado } = useAuth();
  const navigate = useNavigate();

  const [submission, setSubmission] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [generalFeedback, setGeneralFeedback] =
    useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] =
    useState("");

  async function loadSubmission() {
    if (!usuarioLogado?.id) {
      throw new Error(
        "O usuário do professor não foi identificado."
      );
    }

    if (!submissionId) {
      throw new Error(
        "O ID da entrega não foi encontrado na rota."
      );
    }

    let data;
    try {
      data = await apiFetch(
        `/api/teacher/by-user/${usuarioLogado.id}/submissions/${submissionId}/full`
      );
    } catch (loadSubmissionError) {
      throw new Error(
        loadSubmissionError.data?.message ||
          "Erro ao buscar a entrega do aluno.",
        { cause: loadSubmissionError }
      );
    }

    const normalizedAnswers = (
      Array.isArray(data.answers) ? data.answers : []
    ).map((answer) => {
      const isMultipleChoice =
        answer.question_type === "multiple_choice";

      const selectedOptionIsCorrect =
        answer.selected_option_is_correct === 1 ||
        answer.selected_option_is_correct === true ||
        answer.selected_option_is_correct === "1";

      let normalizedScore =
        answer.score_awarded ?? "";

      /*
        Preenche automaticamente questões objetivas
        que ainda não tenham sido corrigidas.
      */
      if (
        isMultipleChoice &&
        (answer.score_awarded === null ||
          answer.score_awarded === undefined)
      ) {
        normalizedScore = selectedOptionIsCorrect
          ? Number(answer.max_points)
          : 0;
      }

      return {
        ...answer,
        score_awarded: normalizedScore,
        answer_feedback:
          answer.answer_feedback || "",
      };
    });

    setSubmission(data.submission || null);
    setAnswers(normalizedAnswers);
    setGeneralFeedback(
      data.submission?.feedback || ""
    );
  }

  useEffect(() => {
    if (!usuarioLogado?.id || !submissionId) return;

    async function loadPageData() {
      try {
        setLoading(true);
        setError("");

        await loadSubmission();
      } catch (error) {
        console.error(
          "Erro ao carregar entrega:",
          error
        );

        setError(
          error.message ||
            "Erro ao carregar entrega."
        );
      } finally {
        setLoading(false);
      }
    }

    loadPageData();
  }, [usuarioLogado?.id, submissionId]);

  const isGraded =
    submission?.status === "graded";

  const isExam =
    submission?.activity_kind === "exam";

  const entityLabel = isExam
    ? "avaliação"
    : "atividade";

  const submissionsBackRoute = submission
    ? isExam
      ? `/professor/avaliacoes/${submission.activity_id}/envios`
      : `/professor/atividades/${submission.activity_id}/envios`
    : "/professor/atividades";

  const totalScore = useMemo(() => {
    return answers.reduce((total, answer) => {
      const score = Number(answer.score_awarded);

      return total + (Number.isNaN(score) ? 0 : score);
    }, 0);
  }, [answers]);

  const gradedAnswersCount = useMemo(() => {
    return answers.filter((answer) => {
      if (
        answer.score_awarded === "" ||
        answer.score_awarded === null ||
        answer.score_awarded === undefined
      ) {
        return false;
      }

      return !Number.isNaN(
        Number(answer.score_awarded)
      );
    }).length;
  }, [answers]);

  function handleScoreChange(answerId, value) {
    setAnswers((previousAnswers) =>
      previousAnswers.map((answer) =>
        answer.answer_id === answerId
          ? {
              ...answer,
              score_awarded: value,
            }
          : answer
      )
    );
  }

  function handleFeedbackChange(answerId, value) {
    setAnswers((previousAnswers) =>
      previousAnswers.map((answer) =>
        answer.answer_id === answerId
          ? {
              ...answer,
              answer_feedback: value,
            }
          : answer
      )
    );
  }

  function validateGrading() {
    if (!submission) {
      throw new Error(
        "Os dados da entrega não foram carregados."
      );
    }

    if (answers.length === 0) {
      throw new Error(
        "Esta entrega não possui respostas para corrigir."
      );
    }

    for (
      let index = 0;
      index < answers.length;
      index++
    ) {
      const answer = answers[index];

      if (
        answer.score_awarded === "" ||
        answer.score_awarded === null ||
        answer.score_awarded === undefined
      ) {
        throw new Error(
          `Informe a pontuação da questão ${
            index + 1
          }.`
        );
      }

      const score = Number(
        answer.score_awarded
      );

      const maxPoints = Number(
        answer.max_points
      );

      if (Number.isNaN(score)) {
        throw new Error(
          `A pontuação da questão ${
            index + 1
          } é inválida.`
        );
      }

      if (score < 0) {
        throw new Error(
          `A questão ${
            index + 1
          } não pode receber pontuação negativa.`
        );
      }

      if (
        !Number.isNaN(maxPoints) &&
        score > maxPoints
      ) {
        throw new Error(
          `A questão ${
            index + 1
          } vale no máximo ${formatScore(
            maxPoints
          )} ponto(s).`
        );
      }
    }

    const maxScore = Number(
      submission.max_score
    );

    if (
      !Number.isNaN(maxScore) &&
      totalScore > maxScore
    ) {
      throw new Error(
        `A nota total não pode ultrapassar ${formatScore(
          maxScore
        )}.`
      );
    }
  }

  async function handleFinalizeGrading() {
    try {
      setSaving(true);
      setError("");
      setSuccessMessage("");

      validateGrading();

      const payload = {
        status: "graded",
        feedback:
          generalFeedback.trim() || null,

        answers: answers.map((answer) => ({
          answer_id: Number(answer.answer_id),
          score_awarded: Number(
            answer.score_awarded
          ),
          feedback:
            answer.answer_feedback?.trim() ||
            null,
        })),
      };

      console.log(
        "Payload da correção:",
        payload
      );

      let data;
      try {
        data = await apiFetch(
          `/api/teacher/by-user/${usuarioLogado.id}/submissions/${submissionId}/grade`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          }
        );
      } catch (saveGradeError) {
        throw new Error(
          saveGradeError.data?.message ||
            saveGradeError.data?.sqlMessage ||
            saveGradeError.data?.error ||
            "Não foi possível salvar a correção.",
          { cause: saveGradeError }
        );
      }

      setSuccessMessage(
        data.message ||
          "Correção finalizada com sucesso."
      );

      /*
        Atualiza a página com os dados persistidos.
      */
      await loadSubmission();
    } catch (error) {
      console.error(
        "Erro ao finalizar correção:",
        error
      );

      setError(
        error.message ||
          "Não foi possível finalizar a correção."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <p className="text-gray-500">
          Carregando entrega...
        </p>
      </main>
    );
  }

  if (error && !submission) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <section className="w-full max-w-xl rounded-2xl bg-white p-8 text-center shadow">
          <h1 className="text-2xl font-bold text-gray-900">
            Não foi possível abrir a entrega
          </h1>

          <p className="mt-3 text-red-600">
            {error}
          </p>

          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mt-6 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Voltar
          </button>
        </section>
      </main>
    );
  }

  if (!submission) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <p className="text-gray-600">
          Entrega não encontrada.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-2xl bg-white p-6 shadow">
          <Link
            to={submissionsBackRoute}
            className="text-sm font-semibold text-blue-600 transition hover:text-blue-700"
          >
            ← Voltar para os envios
          </Link>

          <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
                Correção de {entityLabel}
              </p>

              <h1 className="mt-2 text-3xl font-bold text-gray-900">
                {submission.activity_title}
              </h1>

              <p className="mt-2 text-gray-600">
                Curso: {submission.course_name}
              </p>

              {(submission.classId ?? submission.class_id) && (
                <p className="mt-1 text-sm font-semibold text-purple-700">
                  Turma:{" "}
                  {submission.className ||
                    submission.class_name ||
                    "turma específica"}
                </p>
              )}
            </div>

            <StatusBadge
              status={submission.status}
            />
          </div>

          <div className="mt-6 grid gap-4 border-t border-gray-100 pt-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Aluno
              </p>

              <p className="mt-1 font-semibold text-gray-900">
                {submission.student_name}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Matrícula
              </p>

              <p className="mt-1 text-gray-700">
                {submission.registration_number ||
                  "-"}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Enviado em
              </p>

              <p className="mt-1 text-gray-700">
                {formatDate(
                  submission.submitted_at
                )}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Nota máxima
              </p>

              <p className="mt-1 font-semibold text-gray-900">
                {formatScore(
                  submission.max_score
                )}
              </p>
            </div>
          </div>
        </section>

        {successMessage && (
          <div className="mt-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {successMessage}
          </div>
        )}

        {error && submission && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="mt-8 space-y-6">
          {answers.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center text-gray-500 shadow">
              Esta entrega não possui respostas cadastradas.
            </div>
          ) : (
            answers.map((answer, index) => (
              <SubmissionAnswerReviewCard
                key={answer.answer_id}
                answer={answer}
                questionNumber={index + 1}
                readOnly={isGraded}
                onScoreChange={handleScoreChange}
                onFeedbackChange={
                  handleFeedbackChange
                }
              />
            ))
          )}
        </section>

        <section className="mt-8 rounded-2xl bg-white p-6 shadow">
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <label className="block text-sm font-medium text-gray-700">
              Feedback geral

              <textarea
                rows="6"
                value={generalFeedback}
                disabled={isGraded}
                onChange={(event) =>
                  setGeneralFeedback(
                    event.target.value
                  )
                }
                placeholder="Escreva um comentário geral sobre o desempenho do aluno..."
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
              />
            </label>

            <aside className="rounded-2xl bg-gray-50 p-5">
              <h2 className="font-bold text-gray-900">
                Resumo da correção
              </h2>

              <div className="mt-5 space-y-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">
                    Questões corrigidas
                  </span>

                  <strong className="text-gray-900">
                    {gradedAnswersCount}/
                    {answers.length}
                  </strong>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-500">
                    Pontos atribuídos
                  </span>

                  <strong className="text-gray-900">
                    {formatScore(totalScore)}
                  </strong>
                </div>

                <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                  <span className="text-gray-500">
                    Nota máxima
                  </span>

                  <strong className="text-gray-900">
                    {formatScore(
                      submission.max_score
                    )}
                  </strong>
                </div>
              </div>
            </aside>
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <Link
              to={submissionsBackRoute}
              className="rounded-xl border border-gray-300 px-5 py-2.5 text-center text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
            >
              Voltar sem salvar
            </Link>

            {!isGraded ? (
              <button
                type="button"
                onClick={handleFinalizeGrading}
                disabled={
                  saving || answers.length === 0
                }
                className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {saving
                  ? "Salvando correção..."
                  : "Finalizar correção"}
              </button>
            ) : (
              <div className="rounded-xl bg-green-100 px-5 py-2.5 text-sm font-semibold text-green-700">
                Correção finalizada
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}