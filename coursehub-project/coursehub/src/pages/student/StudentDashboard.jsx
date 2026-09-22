import { Link } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";

import useStudentProgress from "../../services/StudentProgressService";
import { publicImageUrl } from "../../utils/publicImageUrl";


/**
 * Normaliza um percentual para que nunca fique
 * abaixo de 0 ou acima de 100.
 */
function clampPercentage(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.min(
    Math.max(number, 0),
    100
  );
}

/**
 * Formata percentual para exibição.
 */
function formatPercentage(value) {
  return `${Math.round(
    clampPercentage(value)
  )}%`;
}

export default function StudentDashboard() {
  const { usuarioLogado } = useAuth();

  const {
    overview,
    loading,
    error,
  } = useStudentProgress(
    usuarioLogado?.id
  );

  /*
   * ========================================
   * LOADING
   * ========================================
   */

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-2xl bg-white p-8 shadow-sm">
            <p className="text-gray-500">
              Carregando seu progresso...
            </p>
          </div>
        </div>
      </main>
    );
  }

  /*
   * ========================================
   * USUÁRIO NÃO ENCONTRADO
   * ========================================
   */

  if (!usuarioLogado) {
    return (
      <p>
        Usuário não encontrado.
      </p>
    );
  }

  /*
   * ========================================
   * ERRO
   * ========================================
   */

  if (error) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
            <p className="font-semibold text-red-700">
              Não foi possível carregar seu progresso.
            </p>

            <p className="mt-2 text-sm text-red-600">
              {error}
            </p>
          </div>
        </div>
      </main>
    );
  }

  /*
   * ========================================
   * DADOS RECEBIDOS DO BACKEND
   * ========================================
   */

  const courses =
    Array.isArray(overview?.courses)
      ? overview.courses
      : [];

  const summary =
    overview?.summary || {};

  const continueLearning =
    overview?.continue_learning || null;

  /*
   * Quantidade de cursos matriculados.
   */
  const totalCourses =
    Number(
      summary.total_courses
    ) || 0;

  /*
   * Progresso REAL global.
   *
   * Esse valor já é calculado pelo backend
   * considerando os conteúdos dos cursos.
   */
  const globalProgress =
    clampPercentage(
      summary.content_progress_percentage
    );

  /*
   * ========================================
   * CURSO ATUAL
   * ========================================
   *
   * Em vez de matriculas[0], usamos a lógica
   * continue_learning do backend.
   *
   * O backend prioriza:
   *
   * 1. curso acessado recentemente;
   * 2. curso em andamento;
   * 3. curso não iniciado;
   * 4. primeiro disponível.
   */

  const currentCourse =
    courses.find(
      (course) =>
        Number(course.course_id) ===
        Number(
          continueLearning?.course_id
        )
    ) ||
    courses[0] ||
    null;

  /*
   * Progresso REAL do curso atual.
   */
  const currentProgress =
    clampPercentage(
      currentCourse
        ?.content_progress
        ?.progress_percentage
    );

  /*
   * ========================================
   * URL PARA CONTINUAR ESTUDANDO
   * ========================================
   *
   * Se existe próximo conteúdo:
   *
   * /courses/5:32
   *
   * curso 5
   * conteúdo 32
   *
   * Caso contrário:
   *
   * /courses/5
   */

  const continuePath =
    continueLearning?.course_id
      ? continueLearning.content_id
        ? `/aluno/dashboard-aluno/courses/${continueLearning.course_id}:${continueLearning.content_id}`
        : `/aluno/dashboard-aluno/courses/${continueLearning.course_id}`
      : currentCourse
        ? `/aluno/dashboard-aluno/courses/${currentCourse.course_id}`
        : null;

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="mx-auto max-w-6xl">

        {/* ===================================
            HERO
        =================================== */}

        <section className="relative mb-10 overflow-hidden rounded-[2rem] bg-slate-950 text-white">

          {/* Background decorativo */}

          <div
            aria-hidden="true"
            className="absolute inset-0"
          >
            <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-blue-600/20 blur-3xl" />

            <div className="absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />

            <div
              className="
                absolute inset-0
                bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)]
                bg-[size:48px_48px]
              "
            />

            <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/90 to-slate-950/40" />
          </div>

          {/* Conteúdo */}

          <div className="relative grid gap-10 px-5 py-10 md:px-10 md:py-12 lg:grid-cols-[1.3fr_0.7fr] lg:items-center">

            <div>
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-sm font-medium text-blue-200 backdrop-blur-sm">
                Área do aluno
              </div>

              <h1 className="mt-5 max-w-3xl text-4xl font-bold text-white">
                O estudo se aprofunda quando há um lugar para retomar.
              </h1>

              <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">
                Continue seus estudos,
                acompanhe seu progresso e
                retome sua jornada de onde
                parou.
              </p>

              {continuePath && (
                <Link
                  to={continuePath}
                  className="
                    mt-7 inline-flex
                    items-center
                    justify-center
                    rounded-xl
                    bg-white
                    px-5
                    py-3
                    text-sm
                    font-semibold
                    text-slate-950
                    transition
                    hover:bg-blue-50
                  "
                >
                  Continuar estudando
                </Link>
              )}
            </div>

            {/* ===============================
                CURSO ATUAL
            =============================== */}

            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur-md">

              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-200">
                Curso atual
              </p>

              <h2 className="mt-3 text-xl font-semibold tracking-tight text-white">
                {currentCourse
                  ? currentCourse.course_title
                  : "Nenhum curso disponível"}
              </h2>

              {currentCourse && (
                <>
                  {currentCourse.description && (
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">
                      {currentCourse.description}
                    </p>
                  )}

                  <div className="mt-6">

                    <div className="flex items-center justify-between text-sm">

                      <span className="text-slate-400">
                        Progresso
                      </span>

                      <span className="font-medium text-white">
                        {formatPercentage(
                          currentProgress
                        )}
                      </span>

                    </div>

                    {/* BARRA REAL */}

                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">

                      <div
                        className="
                          h-full
                          rounded-full
                          bg-blue-400
                          transition-all
                          duration-500
                        "
                        style={{
                          width: `${currentProgress}%`,
                        }}
                      />

                    </div>

                    {/* Informações extras */}

                    <p className="mt-3 text-xs text-slate-400">
                      {currentCourse
                        ?.content_progress
                        ?.completed_contents ?? 0}
                      {" de "}
                      {currentCourse
                        ?.content_progress
                        ?.total_contents ?? 0}
                      {" conteúdos concluídos"}
                    </p>

                  </div>
                </>
              )}

            </div>

          </div>
        </section>

        {/* ===================================
            RESUMO
        =================================== */}

        <section className="mb-10 grid gap-6 md:grid-cols-3">

          {/* Curso atual */}

          <div className="rounded-2xl bg-white p-6 shadow-sm">

            <p className="text-sm text-gray-500">
              Curso atual
            </p>

            <h2 className="mt-2 text-xl font-bold text-gray-900">
              {currentCourse
                ? currentCourse.course_title
                : "Nenhum curso disponível"}
            </h2>

          </div>

          {/* Progresso geral REAL */}

          <div className="rounded-2xl bg-white p-6 shadow-sm">

            <p className="text-sm text-gray-500">
              Progresso geral
            </p>

            <h2 className="mt-2 text-3xl font-bold text-gray-900">
              {formatPercentage(
                globalProgress
              )}
            </h2>

            <p className="mt-2 text-sm text-gray-500">
              {summary.completed_contents ?? 0}
              {" de "}
              {summary.total_contents ?? 0}
              {" conteúdos concluídos"}
            </p>

          </div>

          {/* Cursos */}

          <div className="rounded-2xl bg-white p-6 shadow-sm">

            <p className="text-sm text-gray-500">
              Cursos matriculados
            </p>

            <h2 className="mt-2 text-3xl font-bold text-gray-900">
              {totalCourses}
            </h2>

          </div>

        </section>

        {/* ===================================
            MEUS CURSOS
        =================================== */}

        <section>

          <div className="mb-6">

            <h2 className="text-2xl font-bold text-gray-900">
              Meus cursos
            </h2>

            <p className="text-gray-500">
              Continue de onde parou.
            </p>

          </div>

          {/* Nenhum curso */}

          {courses.length === 0 ? (
            <div className="rounded-2xl bg-white p-8 text-center shadow-sm">

              <p className="font-semibold text-gray-700">
                Nenhum curso disponível.
              </p>

              <p className="mt-2 text-sm text-gray-500">
                Quando sua matrícula estiver
                ativa, seus cursos aparecerão
                aqui.
              </p>

            </div>
          ) : (

            <div className="grid gap-6 md:grid-cols-2">

              {courses.map((course) => {

                /*
                 * Progresso REAL deste curso.
                 */
                const progress =
                  clampPercentage(
                    course
                      ?.content_progress
                      ?.progress_percentage
                  );

                /*
                 * Se houver um próximo conteúdo,
                 * continua exatamente nele.
                 */
                const coursePath =
                  course.next_content_id
                    ? `/aluno/dashboard-aluno/courses/${course.course_id}:${course.next_content_id}`
                    : `/aluno/dashboard-aluno/courses/${course.course_id}`;

                return (
                  <article
                    key={course.course_id}
                    className="
                      group
                      overflow-hidden
                      rounded-2xl
                      border
                      border-gray-200
                      bg-white
                      shadow-sm
                      transition
                      duration-300
                      hover:-translate-y-0.5
                      hover:border-blue-200
                      hover:shadow-lg
                    "
                  >

                    {/* Imagem */}

                    <div className="relative h-44 w-full overflow-hidden bg-slate-100">

                      <img
                        src={publicImageUrl(course.image_url)}
                        alt={
                          course.course_title
                        }
                        loading="lazy"
                        decoding="async"
                        className="
                          h-full
                          w-full
                          object-cover
                          transition
                          duration-500
                          group-hover:scale-[1.04]
                        "
                        onError={(event) => {
                          event.currentTarget.src =
                            "/images/default-course.webp";
                        }}
                      />

                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-slate-950/10 to-transparent" />

                      {course.category && (
                        <span className="absolute bottom-3 left-3 rounded-full border border-white/25 bg-slate-950/40 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
                          {course.category}
                        </span>
                      )}

                    </div>

                    <div className="p-6">

                      <h3 className="text-xl font-bold text-gray-900">
                        {course.course_title}
                      </h3>

                      <p className="mt-3 text-sm text-gray-500">
                        Nível:{" "}
                        {course.nivel || "-"}

                        {" • "}

                        Categoria:{" "}
                        {course.category || "-"}
                      </p>

                      {/* Barra real */}

                      <div className="mt-5 h-3 overflow-hidden rounded-full bg-gray-200">

                        <div
                          className="
                            h-3
                            rounded-full
                            bg-blue-600
                            transition-all
                            duration-500
                          "
                          style={{
                            width: `${progress}%`,
                          }}
                        />

                      </div>

                      <div className="mt-3 flex items-center justify-between gap-4 text-sm">

                        <div>
                          <span className="font-medium text-gray-700">
                            {formatPercentage(
                              progress
                            )}{" "}
                            concluído
                          </span>

                          <p className="mt-1 text-xs text-gray-400">
                            {course
                              ?.content_progress
                              ?.completed_contents ?? 0}
                            {" / "}
                            {course
                              ?.content_progress
                              ?.total_contents ?? 0}
                            {" conteúdos"}
                          </p>
                        </div>

                        <Link
                          to={coursePath}
                          className="
                            font-semibold
                            text-blue-600
                            transition
                            hover:text-blue-700
                          "
                        >
                          {progress > 0
                            ? "Continuar"
                            : "Acessar"}
                        </Link>

                      </div>

                    </div>

                  </article>
                );
              })}

            </div>
          )}

        </section>

      </div>
    </main>
  );
}