import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { apiFetch } from "../../services/APIService";

import LessonPlayer from "../../components/LessonPlayer";

const trackableContentTypes = [
  "video",
  "pdf",
  "text",
  "live_class",
];

export default function CoursePlayer() {
  const { id } = useParams();
  const { usuarioLogado } = useAuth();

  const courseId = String(id).split(":")[0];

  const [course, setCourse] = useState(null);
  const [allContents, setAllContents] = useState([]);
  const [selectedContent, setSelectedContent] =
    useState(null);

  const [selectedType, setSelectedType] =
    useState("video");

  /*
   * Guarda os IDs dos conteúdos concluídos.
   */
  const [completedContentIds, setCompletedContentIds] =
    useState(() => new Set());

  /*
   * Guarda os conteúdos que estão sendo atualizados.
   * Evita vários cliques enquanto a requisição acontece.
   */
  const [
    updatingProgressIds,
    setUpdatingProgressIds,
  ] = useState(() => new Set());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [progressError, setProgressError] =
    useState("");

  const categories = [
    {
      type: "video",
      label: "Vídeo aulas",
    },
    {
      type: "pdf",
      label: "PDFs / Apostilas",
    },
    {
      type: "text",
      label: "Textos",
    },
  ];

  /*
   * Carrega curso, conteúdos e progresso do aluno.
   */
  useEffect(() => {
    if (!courseId) return;

    let ignoreRequest = false;

    async function fetchCourseData() {
      try {
        setLoading(true);
        setError("");
        setProgressError("");

        /*
         * Busca os dados gerais do curso.
         */
        let courseData;
        try {
          courseData = await apiFetch(
            `/api/courses/${courseId}`
          );
        } catch (courseRequestError) {
          throw new Error(
            courseRequestError.data?.message ||
              "Curso não encontrado.",
            { cause: courseRequestError }
          );
        }

        /*
         * Busca os conteúdos visíveis para o aluno: gerais do
         * curso + exclusivos da turma da sua matrícula ativa.
         *
         * Usa a rota autenticada em vez da pública para nunca
         * expor conteúdo de outra turma.
         */
        let contentsData;
        try {
          contentsData = await apiFetch(
            `/api/students/courses/${courseId}/contents`
          );
        } catch (contentsRequestError) {
          throw new Error(
            contentsRequestError.data?.message ||
              "Erro ao buscar conteúdos.",
            { cause: contentsRequestError }
          );
        }

        if (ignoreRequest) return;

        const contentList = (
          Array.isArray(contentsData?.contents)
            ? contentsData.contents
            : []
        ).filter(
          (content) => !content.status || content.status === "active"
        );

        setCourse(courseData);
        setAllContents(contentList);

        const firstVideo = contentList.find(
          (content) =>
            content.type === "video"
        );

        const firstContent =
          firstVideo ||
          contentList[0] ||
          null;

        setSelectedContent(firstContent);

        if (firstContent) {
          setSelectedType(firstContent.type);
        }

        /*
         * Busca o progresso apenas quando existe
         * um aluno autenticado.
         */
        if (usuarioLogado?.id) {
          try {
            let progressData;
            try {
              progressData = await apiFetch(
                `/api/students/by-user/${usuarioLogado.id}/courses/${courseId}/progress`
              );
            } catch (progressFetchError) {
              throw new Error(
                progressFetchError.data?.message ||
                  "Erro ao buscar progresso.",
                { cause: progressFetchError }
              );
            }

            if (ignoreRequest) return;

            const progressContents = Array.isArray(
              progressData
            )
              ? progressData
              : Array.isArray(
                    progressData?.contents
                  )
                ? progressData.contents
                : [];

            const completedIds = new Set(
              progressContents
                .filter(
                  (contentProgress) =>
                    contentProgress.status ===
                      "completed" ||
                    Number(
                      contentProgress.progress_percentage
                    ) >= 100
                )
                .map((contentProgress) =>
                  Number(
                    contentProgress.content_id
                  )
                )
            );

            setCompletedContentIds(
              completedIds
            );
          } catch (progressRequestError) {
            /*
             * Um erro no progresso não impede
             * o curso de abrir.
             */
            console.error(
              "Erro ao carregar progresso do aluno:",
              progressRequestError
            );

            setProgressError(
              progressRequestError.message ||
                "O progresso não pôde ser carregado."
            );
          }
        }
      } catch (requestError) {
        if (ignoreRequest) return;

        console.error(
          "Erro ao buscar dados do curso:",
          requestError
        );

        setCourse(null);
        setAllContents([]);
        setSelectedContent(null);

        setError(
          requestError.message ||
            "Erro ao carregar curso."
        );
      } finally {
        if (!ignoreRequest) {
          setLoading(false);
        }
      }
    }

    fetchCourseData();

    return () => {
      ignoreRequest = true;
    };
  }, [
    courseId,
    usuarioLogado?.id,
  ]);

  const filteredContents = useMemo(() => {
    return allContents.filter(
      (content) =>
        content.type === selectedType
    );
  }, [allContents, selectedType]);

  const totalTrackableContents = useMemo(() => {
    return allContents.filter((content) =>
      trackableContentTypes.includes(
        content.type
      )
    ).length;
  }, [allContents]);

  const completedContentsCount = useMemo(() => {
    return allContents.filter(
      (content) =>
        trackableContentTypes.includes(
          content.type
        ) &&
        completedContentIds.has(
          Number(content.id)
        )
    ).length;
  }, [
    allContents,
    completedContentIds,
  ]);

  const courseProgressPercentage =
    totalTrackableContents > 0
      ? Math.round(
          (completedContentsCount /
            totalTrackableContents) *
            100
        )
      : 0;

  function handleSelectCategory(type) {
    setSelectedType(type);

    const firstContentOfType =
      allContents.find(
        (content) =>
          content.type === type
      );

    setSelectedContent(
      firstContentOfType || null
    );
  }

  function handleSelectContent(content) {
    setSelectedContent(content);
  }

  /*
   * Marca ou desmarca um conteúdo como concluído.
   */
  async function handleToggleCompleted(
    event,
    content
  ) {
    /*
     * Impede que o clique na checkbox também
     * selecione o conteúdo.
     */
    event.stopPropagation();

    if (!usuarioLogado?.id) {
      setProgressError(
        "Usuário do aluno não encontrado."
      );

      return;
    }

    if (!content?.id) {
      setProgressError(
        "Conteúdo não identificado."
      );

      return;
    }

    const normalizedContentId = Number(
      content.id
    );

    const isCurrentlyCompleted =
      completedContentIds.has(
        normalizedContentId
      );

    const nextCompletedState =
      !isCurrentlyCompleted;

    /*
     * Atualização otimista:
     * altera a interface antes da API responder.
     */
    setCompletedContentIds(
      (previousCompletedIds) => {
        const updatedIds = new Set(
          previousCompletedIds
        );

        if (nextCompletedState) {
          updatedIds.add(
            normalizedContentId
          );
        } else {
          updatedIds.delete(
            normalizedContentId
          );
        }

        return updatedIds;
      }
    );

    setUpdatingProgressIds(
      (previousUpdatingIds) => {
        const updatedIds = new Set(
          previousUpdatingIds
        );

        updatedIds.add(
          normalizedContentId
        );

        return updatedIds;
      }
    );

    setProgressError("");

    try {
      const payload = nextCompletedState
        ? {
            status: "completed",
            progress_percentage: 100,
          }
        : {
            status: "in_progress",
            progress_percentage: 0,
          };

      console.log(
        "Atualizando progresso do conteúdo:",
        {
          contentId: normalizedContentId,
          nextCompletedState,
          payload,
        }
      );

      let data;
      try {
        data = await apiFetch(
          `/api/students/by-user/${usuarioLogado.id}/contents/${normalizedContentId}/progress`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          }
        );
      } catch (progressPutError) {
        throw new Error(
          progressPutError.data?.message ||
            "Erro ao atualizar progresso.",
          { cause: progressPutError }
        );
      }

      console.log(
        "Progresso atualizado com sucesso:",
        data
      );
    } catch (progressUpdateError) {
      console.error(
        "Erro ao atualizar progresso:",
        progressUpdateError
      );

      /*
       * Desfaz a alteração otimista se a API falhar.
       */
      setCompletedContentIds(
        (previousCompletedIds) => {
          const revertedIds = new Set(
            previousCompletedIds
          );

          if (isCurrentlyCompleted) {
            revertedIds.add(
              normalizedContentId
            );
          } else {
            revertedIds.delete(
              normalizedContentId
            );
          }

          return revertedIds;
        }
      );

      setProgressError(
        progressUpdateError.message ||
          "Não foi possível atualizar o progresso."
      );
    } finally {
      setUpdatingProgressIds(
        (previousUpdatingIds) => {
          const updatedIds = new Set(
            previousUpdatingIds
          );

          updatedIds.delete(
            normalizedContentId
          );

          return updatedIds;
        }
      );
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Carregando curso...
        </h1>
      </main>
    );
  }

  if (!course) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-bold text-gray-900">
          Curso não encontrado
        </h1>

        {error && (
          <p className="mt-4 text-red-600">
            {error}
          </p>
        )}

        <Link
          to="/aluno/dashboard-aluno"
          className="mt-6 inline-block rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700"
        >
          Voltar para cursos
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <Link
        to="/aluno/dashboard-aluno"
        className="text-sm font-semibold text-blue-600 hover:text-blue-700"
      >
        ← Voltar para o Portal do Aluno
      </Link>

      <h1 className="mt-6 text-3xl font-bold text-gray-900 sm:text-4xl lg:text-5xl">
        {course.name}
      </h1>

      <section className="mt-10 flex flex-col gap-8 lg:flex-row">
        <div className="flex-[1.5] rounded-2xl border border-gray-200 p-4 sm:p-6">
          <LessonPlayer
            lesson={selectedContent}
          />
        </div>

        <aside className="flex-1 rounded-2xl border border-gray-200 p-4 sm:p-6">
          <h2 className="text-xl font-bold text-gray-900">
            Conteúdo do curso
          </h2>

          <nav className="mt-5 grid grid-cols-2 gap-3">
            {categories.map((category) => (
              <button
                key={category.type}
                type="button"
                onClick={() =>
                  handleSelectCategory(
                    category.type
                  )
                }
                className={`rounded-xl border p-3 text-sm font-semibold transition ${
                  selectedType === category.type
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {category.label}
              </button>
            ))}
          </nav>

          {progressError && (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {progressError}
            </p>
          )}

          <div className="mt-6 space-y-2">
            {filteredContents.length === 0 && (
              <p className="rounded-xl border border-gray-200 p-4 text-gray-500">
                Nenhum conteúdo cadastrado nesta
                categoria.
              </p>
            )}

            {filteredContents.map((content) => {
              const contentId = Number(
                content.id
              );

              const isSelected =
                selectedContent?.id ===
                  content.id &&
                selectedContent?.source ===
                  content.source;

              const isCompleted =
                completedContentIds.has(
                  contentId
                );

              const isUpdating =
                updatingProgressIds.has(
                  contentId
                );

              const canTrackProgress =
                trackableContentTypes.includes(
                  content.type
                );

              return (
                <div
                  key={`${content.source}-${content.id}`}
                  className={`flex w-full items-stretch overflow-hidden rounded-xl border transition ${
                    isSelected
                      ? "border-blue-600 bg-blue-50"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}
                >
                  {/*
                   * Área principal do conteúdo.
                   */}
                  <button
                    type="button"
                    onClick={() =>
                      handleSelectContent(
                        content
                      )
                    }
                    className="min-w-0 flex-1 p-3 text-left"
                  >
                    <span
                      className={`block font-semibold ${
                        isSelected
                          ? "text-blue-700"
                          : "text-gray-900"
                      }`}
                    >
                      {content.title}
                    </span>

                    <span className="mt-1 block text-xs text-gray-500">
                      {content.type ===
                        "video" &&
                        "Vídeo aula"}

                      {content.type ===
                        "pdf" &&
                        "PDF / Apostila"}

                      {content.type ===
                        "text" &&
                        "Texto"}

                      {content.type ===
                        "live_class" &&
                        "Aula ao vivo"}
                    </span>
                  </button>

                  {/*
                   * Controle de conclusão à direita.
                   */}
                  {canTrackProgress && (
                    <button
                      type="button"
                      onClick={(event) =>
                        handleToggleCompleted(
                          event,
                          content
                        )
                      }
                      disabled={isUpdating}
                      aria-pressed={isCompleted}
                      aria-label={
                        isCompleted
                          ? `Desmarcar ${content.title} como concluído`
                          : `Marcar ${content.title} como concluído`
                      }
                      title={
                        isCompleted
                          ? "Conteúdo concluído"
                          : "Marcar conteúdo como concluído"
                      }
                      className={`flex w-24 shrink-0 flex-col items-center justify-center border-l px-2 py-3 text-center transition-all duration-300 disabled:cursor-wait disabled:opacity-60 ${
                        isSelected
                          ? "border-blue-200"
                          : "border-gray-200"
                      } ${
                        isCompleted
                          ? "bg-green-50 hover:bg-green-100"
                          : "bg-white hover:bg-gray-50"
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-md border-2 transition-all duration-200 ${
                          isCompleted
                            ? "animate-check-pop border-green-500 bg-green-500 text-white"
                            : "border-gray-300 bg-white text-transparent hover:border-blue-400"
                        }`}
                      >
                        <svg
                          viewBox="0 0 20 20"
                          fill="none"
                          aria-hidden="true"
                          className={`h-4 w-4 transition-all duration-200 ${
                            isCompleted
                              ? "scale-100 opacity-100"
                              : "scale-75 opacity-0"
                          }`}
                        >
                          <path
                            d="M4.5 10.5L8 14L15.5 6.5"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>

                      <span
                        className={`mt-1.5 text-[10px] font-medium leading-tight ${
                          isCompleted
                            ? "text-green-700"
                            : "text-gray-500"
                        }`}
                      >
                        {isUpdating
                          ? "Salvando..."
                          : isCompleted
                            ? "Conteúdo concluído"
                            : "Marcar como concluído"}
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/*
           * Resumo simples do progresso do curso.
           */}
          <div className="mt-6 border-t border-gray-200 pt-5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-gray-700">
                Progresso do curso
              </span>

              <span className="font-bold text-blue-700">
                {courseProgressPercentage}%
              </span>
            </div>

            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-300"
                style={{
                  width: `${courseProgressPercentage}%`,
                }}
              />
            </div>

            <p className="mt-2 text-xs text-gray-500">
              {completedContentsCount} de{" "}
              {totalTrackableContents} conteúdos
              concluídos
            </p>
          </div>
        </aside>
      </section>
    </main>
  );
}