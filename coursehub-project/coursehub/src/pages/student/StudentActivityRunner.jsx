import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { apiFetch } from "../../services/APIService";
import { uploadUserFile } from "../../services/ProfileService";
import FileUploadField from "../../components/uploads/FileUploadField";

function getDraftStorageKey(activityId) {
  return `activity-draft-${activityId}`;
}

export default function StudentActivityRunner() {
  const { activityId } = useParams();
  const [searchParams] = useSearchParams();
  const cameFromGrades = searchParams.get("from") === "notas";


  const [activity, setActivity] = useState(null);
  const [answers, setAnswers] = useState({});

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [examStarted, setExamStarted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenExitCount, setFullscreenExitCount] =
    useState(0);

  const isExam = activity?.activity_kind === "exam";

  const fullscreenSupported =
    typeof document !== "undefined" &&
    Boolean(document.fullscreenEnabled) &&
    typeof document.documentElement?.requestFullscreen === "function";

  const examFocusMode = isExam && examStarted && !fullscreenSupported;

  const alreadySubmitted = [
  "submitted",
  "pending_review",
  "graded",
].includes(activity?.submission_status);

  const canResubmit =
    activity?.submission_status === "returned";

  const entityLabel = isExam ? "avaliação" : "atividade";

  const pluralEntityLabel = cameFromGrades
    ? "notas"
    : isExam
      ? "avaliações"
      : "atividades";

  const backRoute = cameFromGrades
    ? "/aluno/notas"
    : isExam
      ? "/aluno/avaliacoes"
      : "/aluno/atividades";

  useEffect(() => {
  if (!activityId) {
    setError("ID da atividade não informado.");
    setLoading(false);
    return;
  }

  async function fetchActivity() {
    try {
      setLoading(true);
      setError("");

      const data = await apiFetch(
        `/api/students/by-user/activities/${activityId}/full`
      );

      setActivity(data);

      const submissionAlreadyClosed = [
        "submitted",
        "pending_review",
        "graded",
      ].includes(data?.submission_status);

      if (!submissionAlreadyClosed) {
        try {
          const storedDraft = localStorage.getItem(
            getDraftStorageKey(activityId)
          );

          if (storedDraft) {
            const parsedDraft = JSON.parse(storedDraft);

            if (parsedDraft && typeof parsedDraft === "object") {
              setAnswers(parsedDraft);
            }
          }
        } catch (storageError) {
          console.error(
            "Erro ao restaurar rascunho salvo:",
            storageError
          );
        }
      }
    } catch (error) {
      console.error(
        "Erro ao carregar atividade:",
        error
      );

      setActivity(null);

      setError(
        error.message ||
          "Erro ao carregar atividade."
      );
    } finally {
      setLoading(false);
    }
  }

  fetchActivity();
}, [activityId]);

  useEffect(() => {
    function handleFullscreenChange() {
      const currentlyFullscreen =
        Boolean(document.fullscreenElement);

      setIsFullscreen(currentlyFullscreen);

      if (
        activity?.activity_kind === "exam" &&
        examStarted &&
        !currentlyFullscreen
      ) {
        setFullscreenExitCount(
          (previousCount) => previousCount + 1
        );
      }
    }

    document.addEventListener(
      "fullscreenchange",
      handleFullscreenChange
    );

    return () => {
      document.removeEventListener(
        "fullscreenchange",
        handleFullscreenChange
      );
    };
  }, [activity?.activity_kind, examStarted]);

  useEffect(() => {
    if (!isExam || !examStarted || successMessage) return;

    function handleBeforeUnload(event) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener(
      "beforeunload",
      handleBeforeUnload
    );

    return () => {
      window.removeEventListener(
        "beforeunload",
        handleBeforeUnload
      );
    };
  }, [isExam, examStarted, successMessage]);

  // Sem suporte à Fullscreen API (comum em Safari iOS), não há
  // "tela cheia" real para monitorar via fullscreenchange -- em vez
  // disso, contamos quando o aluno sai do app (troca de aba/app,
  // tela bloqueada) via visibilitychange.
  useEffect(() => {
    if (!isExam || !examStarted || fullscreenSupported) return;

    function handleVisibilityChange() {
      if (document.hidden) {
        setFullscreenExitCount(
          (previousCount) => previousCount + 1
        );
      }
    }

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [isExam, examStarted, fullscreenSupported]);

  // Autosave do rascunho -- protege contra a aba recarregar ou ser
  // descartada pelo sistema ao trocar de app no celular. Arquivos
  // não são persistidos (File não sobrevive a reload); o aluno
  // precisa reselecionar o arquivo se isso acontecer.
  useEffect(() => {
    if (!activityId || !activity || alreadySubmitted) return;

    try {
      const persistableAnswers = Object.fromEntries(
        Object.entries(answers).map(([questionId, answer]) => [
          questionId,
          {
            question_id: answer.question_id,
            option_id: answer.option_id,
            answer_text: answer.answer_text,
            file: null,
          },
        ])
      );

      localStorage.setItem(
        getDraftStorageKey(activityId),
        JSON.stringify(persistableAnswers)
      );
    } catch (storageError) {
      console.error("Erro ao salvar rascunho:", storageError);
    }
  }, [answers, activityId, activity, alreadySubmitted]);

  const answeredQuestionsCount = useMemo(() => {
    if (!activity?.questions) return 0;

    return activity.questions.filter((question) => {
      const answer = answers[question.id];

      if (!answer) return false;

      if (question.question_type === "multiple_choice") {
        return Boolean(answer.option_id);
      }

      if (question.question_type === "text") {
        return Boolean(answer.answer_text?.trim());
      }

      if (question.question_type === "upload") {
        return Boolean(answer.file);
      }

      return false;
    }).length;
  }, [activity?.questions, answers]);

  function handleAlternativeChange(questionId, optionId) {
    setAnswers((previousAnswers) => ({
      ...previousAnswers,
      [questionId]: {
        question_id: questionId,
        option_id: optionId,
        answer_text: null,
        file: null,
      },
    }));
  }

  function handleTextChange(questionId, text) {
    setAnswers((previousAnswers) => ({
      ...previousAnswers,
      [questionId]: {
        question_id: questionId,
        option_id: null,
        answer_text: text,
        file: null,
      },
    }));
  }

  function handleFileChange(questionId, file) {
    setAnswers((previousAnswers) => ({
      ...previousAnswers,
      [questionId]: {
        question_id: questionId,
        option_id: null,
        answer_text: null,
        file: file || null,
      },
    }));
  }

  async function handleStartExam() {
    setError("");

    if (alreadySubmitted) {
      setError("Esta avaliação já foi enviada.");
      return;
    }

    if (activity?.is_overdue) {
      setError("O prazo desta avaliação já foi encerrado.");
      return;
    }

    if (!fullscreenSupported) {
      // Sem Fullscreen API (comum em navegadores mobile): a
      // avaliação segue em "modo de foco" via CSS em vez de
      // bloquear o aluno por completo.
      setExamStarted(true);
      return;
    }

    try {
      await document.documentElement.requestFullscreen();

      setExamStarted(true);
      setIsFullscreen(true);
    } catch (error) {
      console.error(
        "Erro ao iniciar avaliação em tela cheia:",
        error
      );

      setExamStarted(true);
    }
  }

  async function handleReturnToFullscreen() {
    try {
      setError("");

      if (!document.fullscreenEnabled) {
        throw new Error(
          "O modo tela cheia não está disponível."
        );
      }

      await document.documentElement.requestFullscreen();
    } catch (error) {
      console.error(
        "Erro ao retornar à tela cheia:",
        error
      );

      setError(
        error.message ||
          "Não foi possível retornar à tela cheia."
      );
    }
  }

  function validateAnswers() {
    if (!activity?.questions?.length) {
      throw new Error(
        `Esta ${entityLabel} não possui questões.`
      );
    }

    return activity.questions.map((question, index) => {
      const answer = answers[question.id];

      if (!answer) {
        throw new Error(
          `Responda a questão ${index + 1}.`
        );
      }

      if (
        question.question_type === "multiple_choice" &&
        !answer.option_id
      ) {
        throw new Error(
          `Selecione uma alternativa na questão ${
            index + 1
          }.`
        );
      }

      if (
        question.question_type === "text" &&
        !answer.answer_text?.trim()
      ) {
        throw new Error(
          `Digite uma resposta na questão ${index + 1}.`
        );
      }

      if (
        question.question_type === "upload" &&
        !answer.file
      ) {
        throw new Error(
          `Selecione um arquivo na questão ${index + 1}.`
        );
      }

      return {
        question_id: Number(question.id),
        option_id: answer.option_id
          ? Number(answer.option_id)
          : null,
        answer_text:
          answer.answer_text?.trim() || null,
        file: answer.file || null,
      };
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    try {
      setSubmitting(true);
      setError("");
      setSuccessMessage("");

     if (alreadySubmitted) {
        throw new Error(
            `Esta ${entityLabel} já foi enviada.`
        );
        }

    if (activity?.is_overdue && !canResubmit) {
        throw new Error(
            `O prazo desta ${entityLabel} já foi encerrado.`
        );
        }

      
      if (!activityId) {
        throw new Error("Atividade não identificada.");
      }

      if (isExam && !examStarted) {
        throw new Error(
          "Inicie a avaliação antes de enviar."
        );
      }

      if (
        isExam &&
        examStarted &&
        fullscreenSupported &&
        !document.fullscreenElement
      ) {
        throw new Error(
          "Retorne à tela cheia antes de enviar a avaliação."
        );
      }

      const normalizedAnswers = validateAnswers();

      const answersPayload = [];

      for (const answer of normalizedAnswers) {
        let fileId = null;

        if (answer.file) {
          const uploaded = await uploadUserFile(answer.file, "submission");
          fileId = uploaded.file.id;
        }

        answersPayload.push({
          question_id: answer.question_id,
          option_id: answer.option_id,
          answer_text: answer.answer_text,
          file_id: fileId,
        });
      }

      const data = await apiFetch(
  `/api/students/activities/${activityId}/submissions`,
        {
          method: "POST",
          body: JSON.stringify({
            answers: answersPayload,
            fullscreen_exit_count: isExam
              ? fullscreenExitCount
              : 0,
          }),
        }
      );

      setSuccessMessage(
        data.message ||
          `${
            isExam ? "Avaliação" : "Atividade"
          } enviada com sucesso.`
      );

      setAnswers({});

      try {
        localStorage.removeItem(getDraftStorageKey(activityId));
      } catch (storageError) {
        console.error("Erro ao limpar rascunho:", storageError);
      }

      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }

      setExamStarted(false);
      setIsFullscreen(false);
    } catch (error) {
      console.error(
        "Erro ao enviar atividade ou avaliação:",
        error
      );

      setError(
        error.message ||
          `Não foi possível enviar a ${entityLabel}.`
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100 p-4 sm:p-6">
        <p className="text-gray-600">
          Carregando atividade...
        </p>
      </main>
    );
  }

  if (error && !activity) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100 p-4 sm:p-6">
        <section className="w-full max-w-lg rounded-2xl bg-white p-6 text-center shadow">
          <p className="text-red-600">{error}</p>

          <Link
            to="/aluno/atividades"
            className="mt-5 inline-block rounded-xl bg-blue-600 px-5 py-2 font-semibold text-white transition hover:bg-blue-700"
          >
            Voltar
          </Link>
        </section>
      </main>
    );
  }

  if (!activity) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100 p-4 sm:p-6">
        <p>Atividade não encontrada.</p>
      </main>
    );
  }

  if (successMessage) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100 p-4 sm:p-6">
        <section className="w-full max-w-xl rounded-3xl bg-white p-6 text-center shadow-lg sm:p-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">
            ✓
          </div>

          <h1 className="mt-5 text-2xl font-bold text-gray-900">
            Envio concluído
          </h1>

          <p className="mt-3 text-gray-600">
            {successMessage}
          </p>

          <Link
            to={backRoute}
            className="mt-6 inline-block rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700"
          >
            Voltar para {pluralEntityLabel}
          </Link>
        </section>
      </main>
    );
  }
  
  if (alreadySubmitted) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-gray-100 p-4 sm:p-6">
        <section className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-lg sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
            {isExam ? "Avaliação" : "Atividade"}
            </p>

            <h1 className="mt-3 text-3xl font-bold text-gray-900">
            {activity.title}
            </h1>

            <p className="mt-3 text-gray-600">
            {activity.description ||
                "Sem descrição cadastrada."}
            </p>

            <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <h2 className="font-bold text-blue-900">
                {activity.submission_status === "graded"
                ? "Correção concluída"
                : "Envio realizado"}
            </h2>

            <p className="mt-2 text-sm text-blue-800">
                {activity.submission_status === "graded"
                ? `Esta ${entityLabel} já foi corrigida.`
                : `Esta ${entityLabel} já foi enviada e aguarda correção.`}
            </p>

            {activity.submitted_at && (
                <p className="mt-3 text-sm text-blue-800">
                Enviada em:{" "}
                <strong>
                    {new Date(
                    activity.submitted_at
                    ).toLocaleString("pt-BR")}
                </strong>
                </p>
            )}
            </div>

            {activity.submission_status === "graded" && (
            <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-5">
                <p className="text-sm text-green-800">
                Nota
                </p>

                <p className="mt-1 text-3xl font-bold text-green-700">
                {activity.submission_score ?? "-"}
                <span className="text-base font-medium">
                    {" "}
                    / {activity.max_score}
                </span>
                </p>

                {activity.submission_feedback && (
                <div className="mt-4">
                    <p className="text-sm font-semibold text-green-900">
                    Feedback do professor
                    </p>

                    <p className="mt-1 text-sm text-green-800">
                    {activity.submission_feedback}
                    </p>
                </div>
                )}

                {activity.graded_at && (
                <p className="mt-4 text-xs text-green-700">
                    Corrigida em:{" "}
                    {new Date(
                    activity.graded_at
                    ).toLocaleString("pt-BR")}
                </p>
                )}
            </div>
            )}

            <Link
            to={backRoute}
            className="mt-6 inline-block rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700"
            >
            Voltar para {pluralEntityLabel}
            </Link>
        </section>
        </main>
    );
    }

  if (activity.is_overdue && !canResubmit) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-gray-100 p-4 sm:p-6">
        <section className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-lg sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-red-600">
            Prazo encerrado
            </p>

            <h1 className="mt-3 text-3xl font-bold text-gray-900">
            {activity.title}
            </h1>

            <p className="mt-3 text-gray-600">
            O prazo para envio desta {entityLabel} já foi encerrado.
            </p>

            {activity.due_date && (
            <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
                Prazo final:{" "}
                {new Date(
                activity.due_date
                ).toLocaleString("pt-BR")}
            </p>
            )}

            <Link
            to={backRoute}
            className="mt-6 inline-block rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700"
            >
            Voltar para {pluralEntityLabel}
            </Link>
        </section>
        </main>
    );
    }

  if (isExam && !examStarted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100 p-4 sm:p-6">
        <section className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-lg sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
            Avaliação
          </p>

          <h1 className="mt-3 text-3xl font-bold text-gray-900">
            {activity.title}
          </h1>

          <p className="mt-3 text-gray-600">
            {activity.description ||
              "Leia atentamente todas as questões antes de enviar."}
          </p>

          <div className="mt-6 space-y-3 rounded-2xl bg-blue-50 p-5 text-sm text-blue-900">
            <p>
              {fullscreenSupported
                ? "A avaliação será aberta em tela cheia."
                : "A avaliação será aberta em modo de foco, ocupando toda a tela."}
            </p>

            <p>
              {fullscreenSupported
                ? "Caso você saia da tela cheia, as questões ficarão bloqueadas até que você retorne."
                : "Se você sair do aplicativo durante a avaliação, a saída será registrada."}
            </p>

            <p>
              Questões:{" "}
              <strong>
                {activity.questions?.length || 0}
              </strong>
            </p>

            <p>
              Nota máxima:{" "}
              <strong>{activity.max_score}</strong>
            </p>

            <p>
              Prazo:{" "}
              <strong>
                {activity.due_date
                  ? new Date(
                      activity.due_date
                    ).toLocaleString("pt-BR")
                  : "Sem prazo"}
              </strong>
            </p>
          </div>

          {error && (
            <p className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/aluno/avaliacoes"
              className="flex-1 rounded-xl border border-gray-300 px-6 py-3 text-center font-semibold text-gray-700 transition hover:bg-gray-100"
            >
              Voltar
            </Link>

            <button
                type="button"
                onClick={handleStartExam}
                disabled={
                    alreadySubmitted ||
                    activity.is_overdue
                }
                className="flex-1 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                >
                {alreadySubmitted
                    ? "Avaliação já enviada"
                    : activity.is_overdue
                    ? "Prazo encerrado"
                    : "Iniciar avaliação"}
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main
      className={`bg-gray-100 p-4 sm:p-6 ${
        examFocusMode ? "fixed inset-0 z-40 overflow-y-auto" : "min-h-screen"
      }`}
    >
      {isExam && examStarted && fullscreenSupported && !isFullscreen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/95 p-4 sm:p-6">
          <section className="w-full max-w-lg rounded-3xl bg-white p-6 text-center shadow-2xl sm:p-8">
            <h2 className="text-2xl font-bold text-gray-900">
              Avaliação pausada
            </h2>

            <p className="mt-3 text-gray-600">
              Retorne ao modo tela cheia para continuar
              respondendo.
            </p>

            <p className="mt-3 text-sm text-gray-500">
              Saídas registradas: {fullscreenExitCount}
            </p>

            <button
              type="button"
              onClick={handleReturnToFullscreen}
              className="mt-6 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700"
            >
              Retornar à tela cheia
            </button>
          </section>
        </div>
      )}

      <section className="mx-auto max-w-4xl rounded-2xl bg-white p-4 shadow sm:p-6">
        {!isExam && (
          <Link
            to={backRoute}
            className="text-sm font-semibold text-blue-600 transition hover:text-blue-700"
          >
            ← Voltar para {pluralEntityLabel}
          </Link>
        )}

        <div className={`${isExam ? "" : "mt-5"} border-b border-gray-200 pb-5`}>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
                {isExam ? "Avaliação" : "Atividade"}
              </p>

              <h1 className="mt-2 text-3xl font-bold text-gray-900">
                {activity.title}
              </h1>

              <p className="mt-2 text-gray-600">
                {activity.description ||
                  "Sem descrição cadastrada."}
              </p>
            </div>

            <div className="rounded-xl bg-gray-100 px-4 py-3 text-sm text-gray-600">
              <p>
                Respondidas:{" "}
                <strong className="text-gray-900">
                  {answeredQuestionsCount}/
                  {activity.questions?.length || 0}
                </strong>
              </p>

              {isExam && (
                <p className="mt-1">
                  {fullscreenSupported
                    ? "Saídas da tela cheia:"
                    : "Saídas do app:"}{" "}
                  <strong className="text-gray-900">
                    {fullscreenExitCount}
                  </strong>
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <span className="rounded-full bg-blue-100 px-3 py-1 font-semibold text-blue-700">
              Curso: {activity.course_title}
            </span>

            {(activity.classId ?? activity.class_id) && (
              <span className="rounded-full bg-purple-100 px-3 py-1 font-semibold text-purple-700">
                Turma:{" "}
                {activity.className ||
                  activity.class_name ||
                  "turma específica"}
              </span>
            )}

            <span className="rounded-full bg-green-100 px-3 py-1 font-semibold text-green-700">
              Nota máxima: {activity.max_score}
            </span>

            <span className="rounded-full bg-yellow-100 px-3 py-1 font-semibold text-yellow-700">
              Prazo:{" "}
              {activity.due_date
                ? new Date(
                    activity.due_date
                  ).toLocaleString("pt-BR")
                : "Sem prazo"}
            </span>
          </div>
        </div>

        {error && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="mt-6 space-y-6"
        >
          {activity.questions?.length === 0 && (
            <p className="rounded-xl border border-gray-200 p-4 text-gray-500">
              Esta {entityLabel} ainda não possui questões
              cadastradas.
            </p>
          )}

          {activity.questions?.map(
            (question, index) => (
              <article
                key={question.id}
                className="rounded-2xl border border-gray-200 bg-gray-50 p-5"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">
                      Questão {index + 1}
                    </h2>

                    <p className="mt-2 text-gray-700">
                      {question.question_text}
                    </p>
                  </div>

                  <span className="w-fit rounded-full bg-white px-3 py-1 text-sm font-medium text-gray-500">
                    {question.points} ponto(s)
                  </span>
                </div>

                {question.question_type ===
                  "multiple_choice" && (
                  <div className="mt-4 space-y-3">
                    {question.options?.map((option) => (
                      <label
                        key={option.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                          answers[question.id]?.option_id ===
                          option.id
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 bg-white hover:bg-blue-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`question-${question.id}`}
                          checked={
                            answers[question.id]?.option_id ===
                            option.id
                          }
                          onChange={() =>
                            handleAlternativeChange(
                              question.id,
                              option.id
                            )
                          }
                        />

                        <span className="text-sm text-gray-800">
                          {option.option_text}
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {question.question_type === "text" && (
                  <textarea
                    rows="5"
                    placeholder="Digite sua resposta..."
                    value={
                      answers[question.id]?.answer_text ||
                      ""
                    }
                    onChange={(event) =>
                      handleTextChange(
                        question.id,
                        event.target.value
                      )
                    }
                    className="mt-4 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                )}

                {question.question_type === "upload" && (
                  <div className="mt-4">
                    <FileUploadField
                      purpose="submission"
                      file={answers[question.id]?.file || null}
                      onFileChange={(file) =>
                        handleFileChange(question.id, file)
                      }
                      label="Arquivo da resposta"
                    />
                  </div>
                )}
              </article>
            )
          )}

          {activity.questions?.length > 0 && (
            <>
              <div className="hidden flex-col gap-3 border-t border-gray-200 pt-5 sm:flex sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-gray-500">
                  Confira suas respostas antes do envio.
                </p>

                <button
                  type="submit"
                  disabled={
                      submitting ||
                      alreadySubmitted ||
                      (activity.is_overdue && !canResubmit)
                  }
                  className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {submitting
                    ? "Enviando..."
                    : `Enviar ${entityLabel}`}
                </button>
              </div>

              {/* Mobile: progresso e envio fixos no rodapé, sem depender de rolar até o fim. */}
              <div className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-3 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.08)] sm:hidden">
                <p className="text-xs text-gray-600">
                  Respondidas{" "}
                  <strong className="text-gray-900">
                    {answeredQuestionsCount}/
                    {activity.questions?.length || 0}
                  </strong>
                </p>

                <button
                  type="submit"
                  disabled={
                      submitting ||
                      alreadySubmitted ||
                      (activity.is_overdue && !canResubmit)
                  }
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {submitting ? "Enviando..." : "Enviar"}
                </button>
              </div>

              <div className="h-16 sm:hidden" aria-hidden="true" />
            </>
          )}
        </form>
      </section>
    </main>
  );
}