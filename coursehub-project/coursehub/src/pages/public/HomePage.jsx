import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../services/APIService";
import { publicImageUrl } from "../../utils/publicImageUrl";
import {
  ArrowRight,
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  Laptop,
  PlayCircle,
  ShieldCheck,
  Video,
} from "lucide-react";

import HeroCarousel from "../../components/home/HeroCarousel";

const benefits = [
  {
    id: 1,
    icon: Laptop,
    title: "Aprenda de onde estiver",
    description:
      "Acesse seus cursos pelo computador ou celular, em um ambiente simples e organizado.",
  },
  {
    id: 2,
    icon: BookOpen,
    title: "Conteúdo bem estruturado",
    description:
      "Vídeos, materiais, atividades e avaliações reunidos em uma única experiência.",
  },
  {
    id: 3,
    icon: Clock3,
    title: "Estude no seu ritmo",
    description:
      "Organize seus estudos, acompanhe prazos e retome os conteúdos quando precisar.",
  },
  {
    id: 4,
    icon: Award,
    title: "Acompanhe sua evolução",
    description:
      "Visualize seu progresso e mantenha clareza sobre os próximos passos da formação.",
  },
];

const experienceItems = [
  {
    id: 1,
    icon: PlayCircle,
    title: "Conteúdos em diferentes formatos",
    description:
      "Aulas em vídeo, textos, PDFs, encontros ao vivo e materiais complementares.",
  },
  {
    id: 2,
    icon: CalendarDays,
    title: "Prazos e atividades organizados",
    description:
      "Encontre atividades, avaliações e datas importantes sem perder informações.",
  },
  {
    id: 3,
    icon: CheckCircle2,
    title: "Progresso sempre visível",
    description:
      "Saiba o que já concluiu e quais conteúdos ainda fazem parte da sua jornada.",
  },
  {
    id: 4,
    icon: ShieldCheck,
    title: "Portal seguro e centralizado",
    description:
      "Acesse cursos, pagamentos e informações acadêmicas em um único ambiente.",
  },
];

const courseResources = [
  {
    id: "videos",
    icon: Video,
    label: "Vídeos",
  },
  {
    id: "pdfs",
    icon: FileText,
    label: "PDFs",
  },
  {
    id: "activities",
    icon: ClipboardCheck,
    label: "Atividades",
  },
  {
    id: "certificate",
    icon: Award,
    label: "Certificado",
  },
];

function getCourseImage(course) {
  return publicImageUrl(
    course.image_url ||
      course.imageUrl ||
      course.image ||
      course.thumbnail_url ||
      course.thumbnail
  );
}

function getCourseCategory(course) {
  return (
    course.category_name ||
    course.category ||
    course.area ||
    "Formação profissional"
  );
}

function getCourseDescription(course) {
  return (
    course.short_description ||
    course.description ||
    "Desenvolva competências práticas com conteúdos organizados, atividades e acompanhamento em uma experiência completa."
  );
}

export default function HomePage() {
  const [courses, setCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [coursesError, setCoursesError] = useState("");

  useEffect(() => {
    async function fetchCourses() {
      try {
        setLoadingCourses(true);
        setCoursesError("");

        const data = await apiFetch("/api/courses");

        setCourses(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error("Erro ao buscar cursos:", error);

        setCourses([]);

        setCoursesError(
          error.message ||
            "Não foi possível carregar os cursos."
        );
      } finally {
        setLoadingCourses(false);
      }
    }

    fetchCourses();
  }, []);

  const featuredCourses = useMemo(() => {
    return courses.slice(0, 3);
  }, [courses]);

  return (
    <main className="bg-white">
      <HeroCarousel />

      <section
        aria-label="Benefícios do CourseHub"
        className="border-b border-slate-100 bg-white"
      >
        <div className="mx-auto grid max-w-7xl gap-px bg-slate-100 md:grid-cols-2 lg:grid-cols-4">
          {benefits.map((benefit) => {
            const Icon = benefit.icon;

            return (
              <article
                key={benefit.id}
                className="bg-white px-7 py-9"
              >
                <div className="mt-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <Icon size={21} />
                </div>

                <h2 className="mt-5 text-base font-semibold text-slate-900">
                  {benefit.title}
                </h2>

                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {benefit.description}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      {/* CURSOS EM DESTAQUE — DISPLAY EDITORIAL */}
      <section className="overflow-hidden bg-white">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
          {/* ABERTURA — CURSOS EM DESTAQUE */}
          <div className="relative isolate overflow-hidden rounded-[2rem] bg-slate-950">
            <img
              src="/images/featured-courses-background.webp"
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              className="pointer-events-none absolute inset-0 h-full w-full object-contain object-left"
            />

            {/* contraste para o texto no lado direito */}
            <div className="absolute inset-0 bg-gradient-to-l from-slate-950/95 via-slate-950/65 to-transparent" />

            <div className="relative flex min-h-[430px] items-center justify-end px-7 py-14 md:px-10 lg:min-h-[480px] lg:px-14">
              <header className="max-w-[560px] text-right">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-300">
                  Cursos em destaque
                </p>

                <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-white md:text-4xl lg:text-5xl">
                  Formações para abrir novos caminhos.
                </h1>

                <p className="mt-5 ml-auto max-w-[520px] text-base leading-7 text-slate-300">
                  Conheça algumas das experiências disponíveis no CourseHub e
                  encontre uma formação alinhada ao que você deseja construir.
                </p>

                <div className="mt-8 flex justify-end">
                  <Link
                    to="/courses"
                    className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
                  >
                    Ver todos os cursos
                    <ArrowRight size={17} />
                  </Link>
                </div>
              </header>
            </div>
          </div>

          <div className="mt-14">
            {loadingCourses ? (
              <div className="space-y-10">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="grid animate-pulse gap-8 border-t border-slate-200 py-10 lg:grid-cols-2"
                  >
                    <div className="aspect-[16/10] rounded-[2rem] bg-slate-100" />

                    <div className="flex flex-col justify-center">
                      <div className="h-4 w-32 rounded bg-slate-100" />
                      <div className="mt-5 h-10 w-4/5 rounded bg-slate-100" />
                      <div className="mt-5 h-4 w-full rounded bg-slate-100" />
                      <div className="mt-3 h-4 w-3/4 rounded bg-slate-100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : coursesError ? (
              <div className="mt-10 rounded-2xl border border-red-200 bg-red-50 p-6">
                <p className="font-medium text-red-700">
                  {coursesError}
                </p>
              </div>
            ) : featuredCourses.length === 0 ? (
              <div className="mt-10 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
                <h2 className="font-semibold text-slate-900">
                  Novos cursos em breve
                </h2>

                <p className="mt-2 text-sm text-slate-500">
                  O catálogo do CourseHub está sendo atualizado.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 border-y border-slate-200">
                {featuredCourses.map((course, index) => {
                  const imageOnRight = index % 2 !== 0;

                  return (
                    <article
                      key={course.id}
                      className="group grid gap-8 py-10 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-16"
                    >
                      <div
                        className={
                          imageOnRight
                            ? "lg:order-2"
                            : "lg:order-1"
                        }
                      >
                        <Link
                          to={`/courses/${course.id}`}
                          aria-label={`Conhecer o curso ${course.title}`}
                          className="block"
                        >
                          <div className="relative aspect-[16/10] overflow-hidden rounded-[2rem] bg-slate-100">
                            <img
                              src={getCourseImage(course)}
                              alt={course.title}
                              loading="lazy"
                              decoding="async"
                              className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.035]"
                              onError={(event) => {
                                event.currentTarget.src =
                                  "/images/default-course.webp";
                              }}
                            />

                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/35 via-transparent to-transparent" />

                            <div className="absolute bottom-5 left-5 rounded-full border border-white/25 bg-slate-950/35 px-4 py-2 text-xs font-semibold text-white backdrop-blur-md">
                              Curso em destaque
                            </div>
                          </div>
                        </Link>
                      </div>

                      <div
                        className={
                          imageOnRight
                            ? "lg:order-1"
                            : "lg:order-2"
                        }
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
                          {getCourseCategory(course)}
                        </p>

                        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                          {course.title}
                        </h2>

                        <p className="mt-5 max-w-xl text-base leading-8 text-slate-600">
                          {getCourseDescription(course)}
                        </p>

                        <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                          {courseResources.map((resource) => {
                            const Icon = resource.icon;

                            return (
                              <div
                                key={resource.id}
                                className="flex items-center gap-2.5 text-sm font-medium text-slate-700"
                              >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                                  <Icon size={17} />
                                </span>

                                <span>{resource.label}</span>
                              </div>
                            );
                          })}
                        </div>

                        <Link
                          to={`/courses/${course.id}`}
                          className="mt-9 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 transition hover:gap-3 hover:text-blue-900"
                        >
                          Conhecer curso
                          <ArrowRight size={17} />
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          {!loadingCourses &&
            !coursesError &&
            featuredCourses.length > 0 && (
              <div className="mt-14 flex flex-col gap-6 rounded-[2rem] bg-slate-50 px-7 py-9 sm:flex-row sm:items-center sm:justify-between md:px-10">
                <div>
                  <p className="text-sm font-semibold text-blue-700">
                    Continue explorando
                  </p>

                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    Encontre a formação certa para o seu momento
                  </h2>

                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    Acesse o catálogo completo e conheça todos os cursos,
                    áreas de estudo e possibilidades disponíveis.
                  </p>
                </div>

                <Link
                  to="/courses"
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Ver todos os cursos
                  <ArrowRight size={17} />
                </Link>
              </div>
            )}
        </div>
      </section>

      <section
        id="como-funciona"
        className="bg-slate-950"
      >
        <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-24">
          <div className="grid gap-14 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
            <div className="lg:sticky lg:top-28">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-400">
                Como funciona
              </p>

              <h2 className="mt-4 max-w-xl text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Tudo o que você precisa para aprender em um único lugar
              </h2>

              <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
                O CourseHub organiza conteúdos, atividades, avaliações,
                progresso e informações acadêmicas para tornar sua
                experiência de aprendizado mais clara.
              </p>

              <Link
                to="/courses"
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
              >
                Ver cursos
                <ArrowRight size={17} />
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {experienceItems.map((item) => {
                const Icon = item.icon;

                return (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-white/10 bg-white/5 p-6"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300">
                      <Icon size={21} />
                    </div>

                    <h3 className="mt-5 text-base font-semibold text-white">
                      {item.title}
                    </h3>

                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      {item.description}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-24">
          <div className="grid items-center gap-14 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">
                Uma jornada mais clara
              </p>

              <h2 className="mt-4 max-w-xl text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                Do primeiro conteúdo à conclusão do curso
              </h2>

              <p className="mt-5 max-w-xl text-base leading-7 text-slate-600">
                Cada etapa da formação permanece organizada para que você
                saiba o que estudar, acompanhe seus resultados e continue
                avançando.
              </p>

              <div className="mt-8 space-y-4">
                {[
                  "Acesse seus cursos matriculados.",
                  "Acompanhe conteúdos e progresso.",
                  "Realize atividades e avaliações.",
                  "Consulte pagamentos e informações do contrato.",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-3"
                  >
                    <CheckCircle2
                      size={20}
                      className="mt-0.5 shrink-0 text-blue-700"
                    />

                    <p className="text-sm leading-6 text-slate-700">
                      {item}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="rounded-[1.5rem] bg-slate-950 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-blue-300">
                      Seu progresso
                    </p>

                    <p className="mt-2 text-xl font-semibold text-white">
                      Desenvolvimento Front-end
                    </p>
                  </div>

                  <div className="rounded-full bg-blue-500/15 px-3 py-1.5 text-xs font-semibold text-blue-300">
                    Em andamento
                  </div>
                </div>

                <div className="mt-8">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">
                      Progresso do curso
                    </span>

                    <span className="font-medium text-white">
                      68%
                    </span>
                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full w-[68%] rounded-full bg-blue-500" />
                  </div>
                </div>

                <div className="mt-8 space-y-3">
                  {[
                    {
                      title: "Fundamentos de React",
                      status: "Concluído",
                    },
                    {
                      title: "Componentes e propriedades",
                      status: "Concluído",
                    },
                    {
                      title: "Gerenciamento de estado",
                      status: "Em andamento",
                    },
                  ].map((content) => (
                    <div
                      key={content.title}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                    >
                      <p className="text-sm font-medium text-white">
                        {content.title}
                      </p>

                      <p className="text-xs text-slate-400">
                        {content.status}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
        <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-8">
          <div className="relative isolate overflow-hidden rounded-[2rem] px-7 py-12 text-center md:px-16 md:py-16">
            {/* BACKGROUND */}
            <img
              src="/images/home-final-cta-background.webp"
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              className="
                pointer-events-none
                absolute
                left-1/2
                top-1/2
                h-[160%]
                w-[160%]
                max-w-none
                -translate-x-1/2
                -translate-y-1/2
                object-cover
                object-center
              "
            />

            {/* Overlay */}
            <div className="absolute inset-0 bg-blue-950/20" />

            {/* CONTEÚDO */}
            <div className="relative">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-100">
                Seu próximo passo começa aqui
              </p>

              <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Encontre um curso alinhado aos seus objetivos
              </h2>

              <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-blue-50/90">
                Conheça o catálogo, consulte os detalhes de cada formação e
                escolha como deseja continuar aprendendo.
              </p>

              <Link
                to="/courses"
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-blue-900 transition hover:bg-blue-50"
              >
                Explorar cursos
                <ArrowRight size={17} />
              </Link>
            </div>
          </div>
        </section>
    </main>
  );
}
