import { useEffect, useState } from "react";

import CardCourses from "../../components/CardCourses";
import { apiFetch } from "../../services/APIService";

export default function CoursesPage() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCursos() {
      try {
        const dados = await apiFetch("/api/courses");

        console.log(
          "Cursos vindos da API:",
          dados
        );

        setCourses(
          Array.isArray(dados)
            ? dados
            : []
        );
      } catch (error) {
        console.error(
          "Erro ao buscar cursos:",
          error
        );

        setCourses([]);
      } finally {
        setLoading(false);
      }
    }

    fetchCursos();
  }, []);

  return (
    <main className="min-h-screen bg-slate-50">
      {/* HERO */}
      <section className="relative isolate overflow-hidden bg-orange-50">
        <img
          src="/images/courses-hero.webp"
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          loading="eager"
          decoding="async"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-bottom"
        />

        {/* Overlay para leitura */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/65 via-slate-950/25 to-transparent" />

        <div className="relative mx-auto flex min-h-[420px] max-w-7xl items-center px-6 py-14 lg:min-h-[480px] lg:px-8 lg:py-20">
          <div className="max-w-[620px]">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-100">
              Catálogo de cursos
            </p>

            <h1 className="mt-4 max-w-[600px] text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
              Encontre o curso que você procura
            </h1>

            <p className="mt-5 max-w-[540px] text-base leading-7 text-orange-50/90 sm:text-lg sm:leading-8">
              Explore as formações disponíveis e escolha o curso
              mais alinhado aos seus objetivos e ao momento da sua
              jornada.
            </p>
          </div>
        </div>
      </section>

      {/* LISTA DE CURSOS */}
      <section className="mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-20">
        <div className="mb-10">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">
            Todos os cursos
          </p>

          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
            Escolha sua próxima formação
          </h2>

          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Veja os cursos disponíveis e acesse os detalhes de cada
            formação.
          </p>
        </div>

        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map(
              (_, index) => (
                <div
                  key={index}
                  className="h-[420px] animate-pulse rounded-[1.75rem] bg-slate-200"
                />
              )
            )}
          </div>
        ) : courses.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <p className="text-base font-medium text-slate-700">
              Nenhum curso encontrado.
            </p>
          </div>
        ) : (
          <div className="grid auto-rows-fr grid-cols-1 items-stretch gap-6 md:grid-cols-2 xl:grid-cols-3">
            {courses.map((course) => (
              <CardCourses
                key={course.id}
                course={course}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}