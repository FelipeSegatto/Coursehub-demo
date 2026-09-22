import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../services/APIService";

function formatDateForInput(date) {
  if (!date) return "";

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  const year = parsedDate.getFullYear();

  const month = String(
    parsedDate.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    parsedDate.getDate()
  ).padStart(2, "0");

  const hours = String(
    parsedDate.getHours()
  ).padStart(2, "0");

  const minutes = String(
    parsedDate.getMinutes()
  ).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function normalizeDueDateForApi(date) {
  if (!date) return null;

  return `${date.replace("T", " ")}:00`;
}

function createEmptyMultipleChoiceOptions() {
  return [
    {
      id: null,
      option_text: "",
      is_correct: false,
    },
    {
      id: null,
      option_text: "",
      is_correct: false,
    },
  ];
}

export default function ActivityModal({
  mode = "create",
  activity = null,
  courses = [],
  classes = [],
  activityKind = "activity",
  userId,
  /*
   * Permite reaproveitar este modal fora do contexto de professor
   * (ex.: admin, que tem escopo global e não tem `userId` de
   * professor). Quando omitido, mantém exatamente os endpoints de
   * professor já usados hoje — comportamento 100% inalterado.
   */
  endpoints = null,
  handleCloseModal,
  onSuccess,
}) {
  const fetchDetailEndpoint = useCallback(
    (activityId) =>
      endpoints?.fetchDetail
        ? endpoints.fetchDetail(activityId)
        : `/api/teacher/by-user/${userId}/activities/${activityId}/full`,
    [endpoints, userId]
  );

  const createEndpoint = () =>
    endpoints?.create ? endpoints.create() : "/api/activities";

  const updateEndpoint = (activityId) =>
    endpoints?.update
      ? endpoints.update(activityId)
      : `/api/teacher/by-user/${userId}/activities/${activityId}`;

  const isEditMode = mode === "edit";
  const isExam = activityKind === "exam";

  const [formData, setFormData] = useState({
    course_id: "",
    class_id: "",
    activity_kind: activityKind,
    title: "",
    description: "",
    type: "mixed",
    due_date: "",
    max_score: 10,
    status: "active",
  });

  /*
   * Turmas do curso atualmente selecionado. A relação é feita
   * sempre por ID — nunca por courseTitle/courseName.
   */
  const availableClasses = formData.course_id
    ? classes.filter((classItem) => {
        const classCourseId =
          classItem.courseId ?? classItem.course_id;

        return (
          Number(classCourseId) === Number(formData.course_id)
        );
      })
    : [];

  const [questions, setQuestions] = useState([]);

  const [loadingActivity, setLoadingActivity] =
    useState(false);

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] = useState("");

  /*
   * Mantém o tipo recebido pela página ao abrir
   * o modal no modo de criação.
   */
  useEffect(() => {
    if (isEditMode) return;

    setFormData((previousFormData) => ({
      ...previousFormData,
      activity_kind: activityKind,
    }));
  }, [activityKind, isEditMode]);

  /*
   * Busca todos os dados da atividade no modo
   * de edição.
   *
   * A listagem principal não possui questões
   * nem alternativas, por isso o GET completo
   * é necessário.
   */
  useEffect(() => {
    if (
      !isEditMode ||
      !activity?.id ||
      !userId
    ) {
      return;
    }

    let ignoreRequest = false;

    async function loadActivityForEdit() {
      try {
        setLoadingActivity(true);
        setError("");

        let data;
        try {
          data = await apiFetch(fetchDetailEndpoint(activity.id));
        } catch (loadActivityError) {
          throw new Error(
            loadActivityError.data?.message ||
              "Não foi possível carregar a atividade.",
            { cause: loadActivityError }
          );
        }

        if (ignoreRequest) return;

        const editingClassId =
          data.classId ?? data.class_id ?? null;

        setFormData({
          course_id: String(data.course_id || ""),
          class_id:
            editingClassId !== null &&
            editingClassId !== undefined
              ? String(editingClassId)
              : "",
          activity_kind:
            data.activity_kind || activityKind,
          title: data.title || "",
          description: data.description || "",
          type: data.type || "mixed",
          due_date: formatDateForInput(
            data.due_date
          ),
          max_score:
            data.max_score !== null &&
            data.max_score !== undefined
              ? Number(data.max_score)
              : 10,
          status: data.status || "active",
        });

        setQuestions(
          Array.isArray(data.questions)
            ? data.questions.map((question) => ({
                id: question.id || null,

                question_text:
                  question.question_text || "",

                question_type:
                  question.question_type ||
                  "multiple_choice",

                points:
                  question.points !== null &&
                  question.points !== undefined
                    ? Number(question.points)
                    : 1,

                order_index:
                  question.order_index || 1,

                options:
                  question.question_type ===
                    "multiple_choice" &&
                  Array.isArray(question.options)
                    ? question.options.map(
                        (option) => ({
                          id: option.id || null,

                          option_text:
                            option.option_text || "",

                          is_correct: Boolean(
                            option.is_correct
                          ),
                        })
                      )
                    : [],
              }))
            : []
        );
      } catch (error) {
        if (ignoreRequest) return;

        console.error(
          "Erro ao carregar atividade para edição:",
          error
        );

        setError(error.message);
      } finally {
        if (!ignoreRequest) {
          setLoadingActivity(false);
        }
      }
    }

    loadActivityForEdit();

    return () => {
      ignoreRequest = true;
    };
  }, [
    isEditMode,
    activity?.id,
    userId,
    activityKind,
    fetchDetailEndpoint,
  ]);

  function handleChange(event) {
    const { name, value } = event.target;

    setFormData((previousFormData) => ({
      ...previousFormData,
      [name]: value,

      /*
       * Trocar de curso invalida a turma escolhida — nunca
       * mantém uma turma de outro curso selecionada.
       */
      ...(name === "course_id" ? { class_id: "" } : {}),
    }));
  }

  function handleActivityKindChange(
    newActivityKind
  ) {
    /*
     * Durante a edição, não permite transformar
     * uma atividade em avaliação, ou vice-versa.
     */
    if (isEditMode) return;

    setFormData((previousFormData) => ({
      ...previousFormData,
      activity_kind: newActivityKind,
    }));
  }

  function addQuestion() {
    setQuestions((previousQuestions) => [
      ...previousQuestions,
      {
        id: null,
        question_text: "",
        question_type: "multiple_choice",
        /*
         * Em branco por padrão: o backend reparte igualmente o
         * que resta da nota máxima entre as questões sem
         * pontuação definida (1 questão = 100%, 2 = 50% cada...).
         * Só vira um número fixo se o professor digitar um valor.
         */
        points: "",
        order_index:
          previousQuestions.length + 1,
        options:
          createEmptyMultipleChoiceOptions(),
      },
    ]);
  }

  function updateQuestion(
    questionIndex,
    field,
    value
  ) {
    setQuestions((previousQuestions) =>
      previousQuestions.map(
        (question, currentIndex) => {
          if (currentIndex !== questionIndex) {
            return question;
          }

          const updatedQuestion = {
            ...question,
            [field]: value,
          };

          /*
           * Remove alternativas quando a questão
           * deixa de ser múltipla escolha.
           */
          if (
            field === "question_type" &&
            value !== "multiple_choice"
          ) {
            updatedQuestion.options = [];
          }

          /*
           * Cria duas alternativas iniciais quando
           * a questão passa a ser múltipla escolha.
           */
          if (
            field === "question_type" &&
            value === "multiple_choice" &&
            (!Array.isArray(question.options) ||
              question.options.length === 0)
          ) {
            updatedQuestion.options =
              createEmptyMultipleChoiceOptions();
          }

          return updatedQuestion;
        }
      )
    );
  }

  function addOption(questionIndex) {
    setQuestions((previousQuestions) =>
      previousQuestions.map(
        (question, currentIndex) => {
          if (currentIndex !== questionIndex) {
            return question;
          }

          return {
            ...question,
            options: [
              ...(question.options || []),
              {
                id: null,
                option_text: "",
                is_correct: false,
              },
            ],
          };
        }
      )
    );
  }

  function updateOption(
    questionIndex,
    optionIndex,
    field,
    value
  ) {
    setQuestions((previousQuestions) =>
      previousQuestions.map(
        (question, currentQuestionIndex) => {
          if (
            currentQuestionIndex !==
            questionIndex
          ) {
            return question;
          }

          return {
            ...question,
            options: question.options.map(
              (option, currentOptionIndex) => {
                if (
                  currentOptionIndex !==
                  optionIndex
                ) {
                  return option;
                }

                return {
                  ...option,
                  [field]: value,
                };
              }
            ),
          };
        }
      )
    );
  }

  function removeQuestion(questionIndex) {
    setQuestions((previousQuestions) =>
      previousQuestions
        .filter(
          (_, currentIndex) =>
            currentIndex !== questionIndex
        )
        .map((question, index) => ({
          ...question,
          order_index: index + 1,
        }))
    );
  }

  function removeOption(
    questionIndex,
    optionIndex
  ) {
    setQuestions((previousQuestions) =>
      previousQuestions.map(
        (question, currentQuestionIndex) => {
          if (
            currentQuestionIndex !==
            questionIndex
          ) {
            return question;
          }

          return {
            ...question,
            options: question.options.filter(
              (_, currentOptionIndex) =>
                currentOptionIndex !== optionIndex
            ),
          };
        }
      )
    );
  }

  function validateForm() {
    if (!formData.course_id) {
      throw new Error("Selecione um curso.");
    }

    if (!userId && !endpoints) {
      throw new Error(
        "Usuário do professor não encontrado."
      );
    }

    if (!formData.activity_kind) {
      throw new Error(
        "Escolha se é atividade ou avaliação."
      );
    }

    if (!formData.title.trim()) {
      throw new Error("Digite o título.");
    }

    if (
      !Number(formData.max_score) ||
      Number(formData.max_score) <= 0
    ) {
      throw new Error(
        "A nota máxima deve ser maior que zero."
      );
    }

    if (questions.length === 0) {
      throw new Error(
        "Adicione pelo menos uma questão."
      );
    }

    for (
      let questionIndex = 0;
      questionIndex < questions.length;
      questionIndex++
    ) {
      const question =
        questions[questionIndex];

      const displayedQuestionNumber =
        questionIndex + 1;

      if (!question.question_text.trim()) {
        throw new Error(
          `Digite o enunciado da questão ${displayedQuestionNumber}.`
        );
      }

      /*
       * Pontuação em branco é válida (o backend reparte
       * automaticamente) -- só rejeita quando o professor digitou
       * algo e esse algo não é um número maior que zero.
       */
      if (
        question.points !== "" &&
        question.points !== null &&
        question.points !== undefined &&
        (!Number(question.points) || Number(question.points) <= 0)
      ) {
        throw new Error(
          `A pontuação da questão ${displayedQuestionNumber} deve ser maior que zero, ou deixe em branco para dividir automaticamente.`
        );
      }

      if (
        question.question_type ===
        "multiple_choice"
      ) {
        if (
          !Array.isArray(question.options) ||
          question.options.length < 2
        ) {
          throw new Error(
            `A questão ${displayedQuestionNumber} precisa ter pelo menos duas alternativas.`
          );
        }

        const hasEmptyOption =
          question.options.some(
            (option) =>
              !option.option_text.trim()
          );

        if (hasEmptyOption) {
          throw new Error(
            `Preencha todas as alternativas da questão ${displayedQuestionNumber}.`
          );
        }

        const hasCorrectOption =
          question.options.some(
            (option) => option.is_correct
          );

        if (!hasCorrectOption) {
          throw new Error(
            `Marque pelo menos uma resposta correta na questão ${displayedQuestionNumber}.`
          );
        }
      }
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (submitting) return;

    try {
      setError("");

      validateForm();

      const normalizedClassId =
        formData.class_id === ""
          ? null
          : Number(formData.class_id);

      const payload = {
        userId: Number(userId),

        course_id: Number(
          formData.course_id
        ),

        class_id: normalizedClassId,

        activity_kind:
          formData.activity_kind,

        title: formData.title.trim(),

        description:
          formData.description.trim() || null,

        type: formData.type,

        due_date: normalizeDueDateForApi(
          formData.due_date
        ),

        max_score:
          Number(formData.max_score) || 10,

        status: formData.status,

        questions: questions.map(
          (question, questionIndex) => ({
            id: question.id || null,

            question_text:
              question.question_text.trim(),

            question_type:
              question.question_type,

            points:
              question.points === "" ||
              question.points === null ||
              question.points === undefined
                ? null
                : Number(question.points),

            order_index:
              questionIndex + 1,

            options:
              question.question_type ===
              "multiple_choice"
                ? question.options.map(
                    (option) => ({
                      id: option.id || null,

                      option_text:
                        option.option_text.trim(),

                      is_correct: Boolean(
                        option.is_correct
                      ),
                    })
                  )
                : [],
          })
        ),
      };

      const endpoint = isEditMode
        ? updateEndpoint(activity.id)
        : createEndpoint();

      const method = isEditMode
        ? "PUT"
        : "POST";

      setSubmitting(true);

      let data;
      try {
        data = await apiFetch(endpoint, {
          method,
          body: JSON.stringify(payload),
        });
      } catch (saveActivityError) {
        throw new Error(
          saveActivityError.data?.message ||
            saveActivityError.data?.sqlMessage ||
            saveActivityError.data?.error ||
            (isEditMode
              ? "Não foi possível atualizar a atividade."
              : "Não foi possível criar a atividade."),
          { cause: saveActivityError }
        );
      }

      await onSuccess?.(data);

      handleCloseModal();
    } catch (error) {
      console.error(
        isEditMode
          ? "Erro ao atualizar atividade:"
          : "Erro ao criar atividade:",
        error
      );

      setError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  const numericMaxScore = Number(formData.max_score) || 0;

  const explicitPointsSum = questions.reduce((total, question) => {
    const value = Number(question.points);

    return question.points !== "" &&
      question.points !== null &&
      question.points !== undefined &&
      Number.isFinite(value) &&
      value > 0
      ? total + value
      : total;
  }, 0);

  const questionsWithoutPoints = questions.filter(
    (question) =>
      question.points === "" ||
      question.points === null ||
      question.points === undefined ||
      !(Number(question.points) > 0)
  ).length;

  const remainingToDistribute = Number(
    (numericMaxScore - explicitPointsSum).toFixed(2)
  );

  const equalShare =
    questionsWithoutPoints > 0
      ? Number((remainingToDistribute / questionsWithoutPoints).toFixed(2))
      : 0;

  const modalTitle = isEditMode
    ? isExam
      ? "Editar avaliação"
      : "Editar atividade"
    : isExam
      ? "Criar avaliação"
      : "Criar atividade";

  const modalDescription = isEditMode
    ? "Altere os dados abaixo e salve as mudanças."
    : "Crie questões objetivas, discursivas ou com envio de arquivo.";

  const submitButtonText = submitting
    ? "Salvando..."
    : isEditMode
      ? "Salvar alterações"
      : isExam
        ? "Salvar avaliação"
        : "Salvar atividade";

  const inputClass =
    "mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200";

  const labelClass =
    "block text-sm font-medium text-gray-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl">
        <button
          type="button"
          onClick={handleCloseModal}
          disabled={submitting}
          className="absolute right-4 top-4 z-10 rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ✕
        </button>

        <div className="shrink-0 border-b border-gray-300 px-6 py-5 pr-14">
          <h2 className="text-xl font-bold text-gray-900">
            {modalTitle}
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            {modalDescription}
          </p>
        </div>

        {loadingActivity && (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-gray-500">
              Carregando dados da atividade...
            </p>
          </div>
        )}

        {!loadingActivity && error && (
          <div className="mx-6 mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loadingActivity && (
          <form
            onSubmit={handleSubmit}
            className="flex-1 space-y-5 overflow-y-auto px-6 py-6"
          >
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">
                O que você deseja criar?
              </p>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <button
                  type="button"
                  disabled={isEditMode}
                  onClick={() =>
                    handleActivityKindChange(
                      "activity"
                    )
                  }
                  className={`rounded-2xl border-2 p-4 text-left transition ${
                    formData.activity_kind ===
                    "activity"
                      ? "border-green-600 bg-green-50"
                      : "border-gray-200 bg-white hover:border-green-300"
                  } ${
                    isEditMode
                      ? "cursor-not-allowed opacity-70"
                      : ""
                  }`}
                >
                  <p className="font-bold text-gray-900">
                    📝 Atividade
                  </p>

                  <p className="mt-1 text-sm text-gray-600">
                    Exercício, tarefa, trabalho ou
                    prática para o aluno.
                  </p>
                </button>

                <button
                  type="button"
                  disabled={isEditMode}
                  onClick={() =>
                    handleActivityKindChange(
                      "exam"
                    )
                  }
                  className={`rounded-2xl border-2 p-4 text-left transition ${
                    formData.activity_kind ===
                    "exam"
                      ? "border-blue-600 bg-blue-50"
                      : "border-gray-200 bg-white hover:border-blue-300"
                  } ${
                    isEditMode
                      ? "cursor-not-allowed opacity-70"
                      : ""
                  }`}
                >
                  <p className="font-bold text-gray-900">
                    📋 Prova/Avaliação
                  </p>

                  <p className="mt-1 text-sm text-gray-600">
                    Prova, avaliação, teste ou exame
                    com nota.
                  </p>
                </button>
              </div>

              {isEditMode && (
                <p className="mt-2 text-xs text-gray-500">
                  O tipo do registro não pode ser
                  alterado durante a edição.
                </p>
              )}
            </div>

            <div>
              <label className={labelClass}>
                Curso

                <select
                  name="course_id"
                  value={formData.course_id}
                  onChange={handleChange}
                  className={inputClass}
                  required
                >
                  <option value="">
                    Selecione um curso
                  </option>

                  {courses.map((course) => (
                    <option
                      key={course.id}
                      value={course.id}
                    >
                      {course.name}
                    </option>
                  ))}
                </select>
              </label>

              {courses.length === 0 && (
                <p className="mt-2 text-sm text-red-600">
                  Nenhum curso foi encontrado para
                  este professor.
                </p>
              )}
            </div>

            <div>
              <label className={labelClass}>
                Turma

                <select
                  name="class_id"
                  value={formData.class_id}
                  onChange={handleChange}
                  disabled={!formData.course_id}
                  className={inputClass}
                >
                  <option value="">
                    Todas as turmas do curso
                  </option>

                  {availableClasses.map((classItem) => (
                    <option
                      key={classItem.id}
                      value={classItem.id}
                    >
                      {classItem.name}
                    </option>
                  ))}
                </select>
              </label>

              <p className="mt-2 text-xs text-gray-500">
                {formData.course_id
                  ? "Deixe em todas as turmas para compartilhar a atividade com o curso inteiro."
                  : "Selecione um curso para escolher uma turma."}
              </p>
            </div>

            <div>
              <label className={labelClass}>
                Título

                <input
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  required
                  placeholder={
                    formData.activity_kind === "exam"
                      ? "Ex: Avaliação de React"
                      : "Ex: Atividade de React"
                  }
                  className={inputClass}
                />
              </label>
            </div>

            <div>
              <label className={labelClass}>
                Descrição/Instruções

                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows="3"
                  placeholder="Explique o que o aluno precisa fazer..."
                  className={inputClass}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <label className={labelClass}>
                Formato das respostas

                <select
                  name="type"
                  value={formData.type}
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value="mixed">
                    Mista
                  </option>

                  <option value="quiz">
                    Somente múltipla escolha
                  </option>

                  <option value="text">
                    Somente discursiva
                  </option>

                  <option value="upload">
                    Somente envio de arquivo
                  </option>
                </select>
              </label>

              <label className={labelClass}>
                Data limite

                <input
                  type="datetime-local"
                  name="due_date"
                  value={formData.due_date}
                  onChange={handleChange}
                  className={inputClass}
                />
              </label>

              <label className={labelClass}>
                Nota máxima

                <input
                  type="number"
                  name="max_score"
                  value={formData.max_score}
                  onChange={handleChange}
                  min="0.5"
                  step="0.5"
                  className={inputClass}
                />

                <span className="mt-1 block text-xs font-normal text-gray-500">
                  Questões sem pontuação própria dividem este valor
                  igualmente entre si.
                </span>
              </label>
            </div>

            <div>
              <label className={labelClass}>
                Status

                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className={inputClass}
                >
                  <option value="active">
                    Publicado
                  </option>

                  <option value="draft">
                    Rascunho
                  </option>

                  <option value="inactive">
                    Inativo
                  </option>

                  <option value="archived">
                    Arquivado
                  </option>
                </select>
              </label>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Questões
                  </h3>

                  <p className="mt-1 text-sm text-gray-500">
                    Adicione e organize as questões da
                    atividade.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={addQuestion}
                  className="shrink-0 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-700"
                >
                  + Adicionar questão
                </button>
              </div>

              {questions.length > 0 && questionsWithoutPoints > 0 && (
                <p className="mb-4 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  {questionsWithoutPoints === questions.length
                    ? `Nenhuma questão tem pontuação definida — as ${questions.length} vão dividir igualmente a nota máxima (${equalShare} ponto(s) cada).`
                    : remainingToDistribute > 0
                      ? `${questionsWithoutPoints} questão(ões) sem pontuação definida vão dividir os ${remainingToDistribute} ponto(s) restantes (${equalShare} cada).`
                      : `A soma das questões já pontuadas (${explicitPointsSum}) atinge ou ultrapassa a nota máxima (${numericMaxScore}) — não resta nada para dividir entre as demais.`}
                </p>
              )}

              {questions.length > 0 &&
                questionsWithoutPoints === 0 &&
                Number(explicitPointsSum.toFixed(2)) !==
                  Number(numericMaxScore.toFixed(2)) && (
                  <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    A soma das pontuações das questões ({explicitPointsSum}) não é igual à
                    nota máxima ({numericMaxScore}). Ajuste algum valor antes de salvar.
                  </p>
                )}

              {questions.length === 0 && (
                <p className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
                  Nenhuma questão adicionada ainda.
                </p>
              )}

              <div className="space-y-4">
                {questions.map(
                  (question, questionIndex) => (
                    <div
                      key={
                        question.id ||
                        `question-${questionIndex}`
                      }
                      className="rounded-2xl border border-gray-300 bg-white p-4"
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h4 className="font-semibold text-gray-900">
                          Questão{" "}
                          {questionIndex + 1}
                        </h4>

                        <button
                          type="button"
                          onClick={() =>
                            removeQuestion(
                              questionIndex
                            )
                          }
                          className="rounded-lg bg-red-100 px-3 py-1 text-sm font-semibold text-red-700 transition hover:bg-red-200"
                        >
                          Remover
                        </button>
                      </div>

                      <label className={labelClass}>
                        Enunciado

                        <textarea
                          value={
                            question.question_text
                          }
                          onChange={(event) =>
                            updateQuestion(
                              questionIndex,
                              "question_text",
                              event.target.value
                            )
                          }
                          rows="2"
                          placeholder="Digite o enunciado da questão..."
                          className={inputClass}
                          required
                        />
                      </label>

                      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                        <label
                          className={labelClass}
                        >
                          Tipo da questão

                          <select
                            value={
                              question.question_type
                            }
                            onChange={(event) =>
                              updateQuestion(
                                questionIndex,
                                "question_type",
                                event.target.value
                              )
                            }
                            className={inputClass}
                          >
                            <option value="multiple_choice">
                              Múltipla escolha
                            </option>

                            <option value="text">
                              Discursiva
                            </option>

                            <option value="upload">
                              Upload
                            </option>
                          </select>
                        </label>

                        <label
                          className={labelClass}
                        >
                          Pontos (opcional)

                          <input
                            type="number"
                            value={question.points}
                            onChange={(event) =>
                              updateQuestion(
                                questionIndex,
                                "points",
                                event.target.value
                              )
                            }
                            min="0.5"
                            step="0.5"
                            placeholder="Automático"
                            className={inputClass}
                          />
                        </label>
                      </div>

                      {question.question_type ===
                        "multiple_choice" && (
                        <div className="mt-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <h5 className="text-sm font-bold text-gray-700">
                              Alternativas
                            </h5>

                            <button
                              type="button"
                              onClick={() =>
                                addOption(
                                  questionIndex
                                )
                              }
                              className="rounded-lg bg-gray-200 px-3 py-1 text-sm font-semibold text-gray-700 transition hover:bg-gray-300"
                            >
                              + Alternativa
                            </button>
                          </div>

                          {question.options.map(
                            (
                              option,
                              optionIndex
                            ) => (
                              <div
                                key={
                                  option.id ||
                                  `option-${questionIndex}-${optionIndex}`
                                }
                                className="flex flex-col gap-2 rounded-xl border border-gray-200 p-3 md:flex-row md:items-center"
                              >
                                <input
                                  value={
                                    option.option_text
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    updateOption(
                                      questionIndex,
                                      optionIndex,
                                      "option_text",
                                      event.target
                                        .value
                                    )
                                  }
                                  placeholder={`Alternativa ${
                                    optionIndex + 1
                                  }`}
                                  className="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                                  required
                                />

                                <label className="flex items-center gap-2 text-sm text-gray-700">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(
                                      option.is_correct
                                    )}
                                    onChange={(
                                      event
                                    ) =>
                                      updateOption(
                                        questionIndex,
                                        optionIndex,
                                        "is_correct",
                                        event.target
                                          .checked
                                      )
                                    }
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />

                                  Correta
                                </label>

                                <button
                                  type="button"
                                  onClick={() =>
                                    removeOption(
                                      questionIndex,
                                      optionIndex
                                    )
                                  }
                                  className="rounded-lg bg-red-100 px-3 py-1 text-sm font-semibold text-red-700 transition hover:bg-red-200"
                                >
                                  X
                                </button>
                              </div>
                            )
                          )}
                        </div>
                      )}

                      {question.question_type ===
                        "text" && (
                        <div className="mt-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-700">
                          O aluno verá um campo para
                          digitar uma resposta.
                        </div>
                      )}

                      {question.question_type ===
                        "upload" && (
                        <div className="mt-4 rounded-xl bg-purple-50 p-4 text-sm text-purple-700">
                          O aluno verá um campo para
                          enviar um arquivo.
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>

            <div className="sticky bottom-0 -mx-6 flex justify-end gap-3 border-t border-gray-200 bg-white px-6 py-4">
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={submitting}
                className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={
                  submitting ||
                  loadingActivity
                }
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitButtonText}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}