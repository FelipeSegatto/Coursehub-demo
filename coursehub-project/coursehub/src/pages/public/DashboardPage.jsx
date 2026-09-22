import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../services/APIService";
import { publicImageUrl } from "../../utils/publicImageUrl";
import {
  ArrowRight,
  Award,
  BookOpen,
  FileText,
  GraduationCap,
  Search,
  Video,
} from "lucide-react";

export default function DashboardPage() {
  const [courses, setCourses] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todas");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchCourses() {
      try {
        setLoading(true);
        setError("");

        const data = await apiFetch("/api/courses");

        setCourses(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Erro ao buscar cursos:", error);

        setCourses([]);

        setError(
          error.message ||
            "Não foi possível carregar os cursos."
        );
      } finally {
        setLoading(false);
      }
    }

    fetchCourses();
  }, []);

  const categories = useMemo(() => {
    const uniqueCategories = courses
      .map((course) => course.category)
      .filter(Boolean);

    return ["Todas", ...new Set(uniqueCategories)];
  }, [courses]);

  const filteredCourses = useMemo(() => {
    const normalizedSearch = search
      .trim()
      .toLowerCase();

    return courses.filter((course) => {
      const courseName = (
        course.name ||
        course.title ||
        ""
      ).toLowerCase();

      const description = (
        course.description || ""
      ).toLowerCase();

      const category = (
        course.category || ""
      ).toLowerCase();

      const matchesSearch =
        !normalizedSearch ||
        courseName.includes(normalizedSearch) ||
        description.includes(normalizedSearch) ||
        category.includes(normalizedSearch);

      const matchesCategory =
        selectedCategory === "Todas" ||
        course.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [courses, search, selectedCategory]);

  const totalCategories = Math.max(
    categories.length - 1,
    0
  );

  function getCourseImage(course) {
    return publicImageUrl(
      course.image_url ||
        course.imageUrl ||
        course.image ||
        course.thumbnail_url ||
        course.thumbnail
    );
  }

  function getCourseName(course) {
    return course.name || course.title || "Curso";
  }

  return (
    <main className="min-h-screen bg-slate-50">
      {/* HERO */}
      {/* HERO */}
        <section
          className="relative isolate overflow-hidden bg-emerald-900"
          style={{
          backgroundImage:
            "url('/images/coursehub-catalog-hero.webp')",
          backgroundSize: "100%",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right",
        }}
        >
          {/* Overlay para leitura do texto */}
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-950/70 via-emerald-950/30 to-transparent" />

          {/* Escurecimento discreto geral */}
          <div className="absolute inset-0 bg-black/5" />

          <div className="relative mx-auto flex min-h-[520px] max-w-7xl items-center px-6 py-16 sm:min-h-[580px] lg:min-h-[640px] lg:px-8">
            <div className="max-w-[650px]">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-50/90">
                Catálogo CourseHub
              </p>

              <h1 className="mt-5 max-w-[620px] text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
                Aprenda hoje.
                <span className="block">
                  Transforme o amanhã.
                </span>
              </h1>

              <p className="mt-6 max-w-[560px] text-base leading-7 text-emerald-50/90 sm:text-lg sm:leading-8">
                Explore novas áreas, desenvolva habilidades e
                encontre a formação certa para o seu próximo passo.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <div className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
                  {courses.length} cursos disponíveis
                </div>

                <div className="rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
                  {totalCategories} áreas de estudo
                </div>
              </div>

              <a
                href="#catalogo"
                className="mt-9 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-50"
              >
                Explorar cursos
                <ArrowRight size={17} />
              </a>
            </div>
          </div>
        </section>

      {/* INDICADORES */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-px bg-slate-200 md:grid-cols-3">
          <article className="bg-white px-6 py-7">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <BookOpen size={21} />
              </div>

              <div>
                <p className="text-sm text-slate-500">
                  Cursos disponíveis
                </p>

                <p className="mt-1 text-2xl font-semibold text-slate-950">
                  {courses.length}
                </p>
              </div>
            </div>
          </article>

          <article className="bg-white px-6 py-7">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <GraduationCap size={21} />
              </div>

              <div>
                <p className="text-sm text-slate-500">
                  Áreas de estudo
                </p>

                <p className="mt-1 text-2xl font-semibold text-slate-950">
                  {totalCategories}
                </p>
              </div>
            </div>
          </article>

          <article className="bg-white px-6 py-7">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <Award size={21} />
              </div>

              <div>
                <p className="text-sm text-slate-500">
                  Experiência completa
                </p>

                <p className="mt-1 text-lg font-semibold text-slate-950">
                  Conteúdo e certificado
                </p>
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* CATÁLOGO */}
      <section className="mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-20">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">
              Todos os cursos
            </p>

            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              Encontre sua próxima formação
            </h2>

            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
              Pesquise por nome, área ou assunto e conheça
              todos os cursos disponíveis na plataforma.
            </p>
          </div>

          <div className="relative w-full lg:max-w-sm">
            <Search
              size={19}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Buscar cursos..."
              className="w-full rounded-full border border-slate-300 bg-white py-3 pl-12 pr-5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            />
          </div>
        </header>

        {/* CATEGORIAS */}
        {categories.length > 1 && (
          <div className="mt-9 flex flex-wrap gap-2">
            {categories.map((category) => {
              const isSelected =
                selectedCategory === category;

              return (
                <button
                  key={category}
                  type="button"
                  onClick={() =>
                    setSelectedCategory(category)
                  }
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    isSelected
                      ? "bg-slate-950 text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950"
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-10">
          {loading ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map(
                (_, index) => (
                  <div
                    key={index}
                    className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white"
                  >
                    <div className="aspect-[16/10] animate-pulse bg-slate-100" />

                    <div className="p-6">
                      <div className="h-4 w-28 animate-pulse rounded bg-slate-100" />

                      <div className="mt-4 h-7 w-4/5 animate-pulse rounded bg-slate-100" />

                      <div className="mt-5 h-4 w-full animate-pulse rounded bg-slate-100" />

                      <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-slate-100" />
                    </div>
                  </div>
                )
              )}
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
              <p className="font-medium text-red-700">
                {error}
              </p>
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
              <BookOpen
                size={32}
                className="mx-auto text-slate-400"
              />

              <h2 className="mt-5 text-lg font-semibold text-slate-950">
                Nenhum curso encontrado
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Tente alterar o termo da busca ou selecionar
                outra categoria.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filteredCourses.map((course) => {
                const courseName = getCourseName(course);

                return (
                  <article
                    key={course.id}
                    className="group flex overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white transition duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-200/60"
                  >
                    <Link
                      to={`/courses/${course.id}`}
                      className="flex w-full flex-col"
                    >
                      <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
                        <img
                          src={getCourseImage(course)}
                          alt={courseName}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                          onError={(event) => {
                            event.currentTarget.src =
                              "/images/default-course.webp";
                          }}
                        />

                        {course.category && (
                          <div className="absolute left-4 top-4 rounded-full border border-white/25 bg-slate-950/45 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md">
                            {course.category}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-1 flex-col p-6">
                        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-blue-700">
                          <GraduationCap size={15} />

                          {course.nivel ||
                            course.level ||
                            "Formação"}
                        </div>

                        <h3 className="mt-4 text-xl font-semibold tracking-tight text-slate-950">
                          {courseName}
                        </h3>

                        <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
                          {course.description ||
                            "Conheça os conteúdos, atividades e recursos disponíveis nesta formação."}
                        </p>

                        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5">
                          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                            <Video
                              size={16}
                              className="text-blue-700"
                            />
                            Vídeos
                          </div>

                          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                            <FileText
                              size={16}
                              className="text-blue-700"
                            />
                            PDFs
                          </div>

                          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                            <BookOpen
                              size={16}
                              className="text-blue-700"
                            />
                            Atividades
                          </div>

                          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
                            <Award
                              size={16}
                              className="text-blue-700"
                            />
                            Certificado
                          </div>
                        </div>

                        <div className="mt-auto flex items-center justify-between pt-7">
                          <span className="text-sm font-semibold text-blue-700">
                            Conhecer curso
                          </span>

                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-700 transition group-hover:bg-blue-700 group-hover:text-white">
                            <ArrowRight size={17} />
                          </span>
                        </div>
                      </div>
                    </Link>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-8">
        <div className="relative isolate overflow-hidden rounded-[2rem] px-7 py-12 text-center md:px-16 md:py-16">
          {/* BACKGROUND */}
          <img
            src="/images/coursehub-cta-background.webp"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
          />

          {/* Overlay discreto para manter contraste */}
          <div className="absolute inset-0 bg-blue-950/20" />

          {/* CONTEÚDO */}
          <div className="relative">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-100">
              Comece sua jornada
            </p>

            <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Crie sua conta e acompanhe toda a sua evolução
            </h2>

            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-blue-50/90">
              Acesse conteúdos, realize atividades, acompanhe seu progresso e
              mantenha toda a sua formação organizada.
            </p>

            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                to="/courses"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-blue-900 transition hover:bg-blue-50"
              >
                Ver cursos
                <ArrowRight size={17} />
              </Link>

              <Link
                to="/login"
                className="inline-flex items-center justify-center rounded-full border border-white/30 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/15"
              >
                Já tenho uma conta
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}