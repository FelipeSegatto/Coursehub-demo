import { useEffect, useState } from "react";

import {
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { Link } from "react-router-dom";

const slides = [
  {
    id: 1,
    image: "/images/coursehub-hero-green.webp",
    alt: "Sala de aula moderna com mesas, cadeiras e quadro ao fundo",
    href: "/courses",

    /*
     * A imagem tem um ponto focal central muito forte.
     * object-center funciona melhor aqui.
     */
    objectPosition: "object-center",

    eyebrow: "CourseHub",

    title:
      "Aprender pode ser mais claro, organizado e conectado.",

    subtitle:
      "Encontre cursos, acompanhe conteúdos e organize sua jornada de aprendizagem em um só lugar.",

    /*
     * Mantém o texto verticalmente centralizado.
     */
    contentPosition: "items-center",

    textPosition: "text-left",

    /*
     * Um pouco menor para não cobrir demais a sala.
     */
    contentWidth: "max-w-[570px]",

    /*
     * Overlay mais neutro que o rosa antigo.
     * A sala continua visível, mas o texto ganha contraste.
     */
    overlay:
      "bg-gradient-to-r from-slate-950/72 via-slate-950/38 via-[30%] to-transparent to-[65%]",
  },

  {
    id: 2,
    image: "/images/coursehub-hero-yellow.webp",
    alt: "Materiais de estudo e planejamento sobre fundo amarelo",
    href: "/courses",
    objectPosition: "object-center",

    eyebrow: "Organize sua jornada",

    title:
      "Tudo o que você precisa para continuar aprendendo.",

    subtitle:
      "Conteúdos, atividades, avaliações e progresso reunidos em uma experiência simples e organizada.",

    contentPosition: "items-center",
    textPosition: "text-left",
    contentWidth: "max-w-[620px]",

    overlay:
      "bg-gradient-to-r from-amber-950/55 via-amber-900/10 to-transparent",
  },

  {
    id: 3,
    image: "/images/coursehub-hero-blue.webp",
    alt: "Materiais escolares sobre fundo azul",
    href: "/courses",
    objectPosition: "object-right",

    eyebrow: "CourseHub",

    title: "Aprender com mais clareza.",

    subtitle:
      "Cursos, atividades, progresso e comunicação em uma experiência educacional mais organizada, moderna e conectada.",

    contentPosition: "items-center",
    textPosition: "text-left",
    contentWidth: "max-w-[600px]",

    overlay:
      "bg-gradient-to-r from-slate-950/65 via-slate-950/15 to-transparent",
  },
];

export default function HeroCarousel() {
  const [currentSlide, setCurrentSlide] =
    useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentSlide((previousSlide) =>
        previousSlide === slides.length - 1
          ? 0
          : previousSlide + 1
      );
    }, 6000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  function showPreviousSlide() {
    setCurrentSlide((previousSlide) =>
      previousSlide === 0
        ? slides.length - 1
        : previousSlide - 1
    );
  }

  function showNextSlide() {
    setCurrentSlide((previousSlide) =>
      previousSlide === slides.length - 1
        ? 0
        : previousSlide + 1
    );
  }

  return (
    <section
      aria-label="Destaques do CourseHub"
      className="bg-white px-6 pt-6 lg:px-8 lg:pt-8"
    >
      <div className="relative mx-auto min-h-[430px] max-w-7xl overflow-hidden rounded-[2rem] bg-slate-950 lg:min-h-[480px]">
        {/* SLIDES */}
        {slides.map((slide, index) => {
          const isActive =
            index === currentSlide;

          return (
            <div
              key={slide.id}
              aria-hidden={!isActive}
              className={`absolute inset-0 transition-opacity duration-700 ${
                isActive
                  ? "z-10 opacity-100"
                  : "pointer-events-none z-0 opacity-0"
              }`}
            >
              {/* IMAGEM */}
              <img
                src={slide.image}
                alt={slide.alt}
                fetchPriority={index === 0 ? "high" : "low"}
                loading={index === 0 ? "eager" : "lazy"}
                decoding="async"
                className={`
                  absolute
                  left-1/2
                  top-1/2
                  h-[125%]
                  w-[125%]
                  max-w-none
                  -translate-x-1/2
                  -translate-y-1/2
                  object-cover
                  ${slide.objectPosition}
                `}
              />

              {/* OVERLAY */}
              <div
                className={`absolute inset-0 ${slide.overlay}`}
              />

              {/* CONTEÚDO */}
              <div
                className={`relative flex min-h-[430px] h-full px-7 py-14 md:px-10 lg:min-h-[480px] lg:px-14 ${slide.contentPosition}`}
              >
                <div
                  className={`${slide.contentWidth} ${slide.textPosition}`}
                >
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-white/85">
                    {slide.eyebrow}
                  </p>

                  <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
                    {slide.title}
                  </h1>

                  <p className="mt-5 max-w-xl text-base leading-7 text-white/85 sm:text-lg sm:leading-8">
                    {slide.subtitle}
                  </p>

                  <Link
                    to={slide.href}
                    tabIndex={
                      isActive ? 0 : -1
                    }
                    className="mt-7 inline-flex items-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
                  >
                    {slide.id === 2
                      ? "Criar minha conta"
                      : "Explorar cursos"}
                  </Link>
                </div>
              </div>
            </div>
          );
        })}

        {/* SETA ESQUERDA */}
        <button
          type="button"
          onClick={showPreviousSlide}
          aria-label="Mostrar banner anterior"
          className="absolute left-3 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-black/30 p-2.5 text-white backdrop-blur-sm transition hover:bg-black/50 sm:flex"
        >
          <ChevronLeft size={24} />
        </button>

        {/* SETA DIREITA */}
        <button
          type="button"
          onClick={showNextSlide}
          aria-label="Mostrar próximo banner"
          className="absolute right-3 top-1/2 z-20 hidden -translate-y-1/2 rounded-full bg-black/30 p-2.5 text-white backdrop-blur-sm transition hover:bg-black/50 sm:flex"
        >
          <ChevronRight size={24} />
        </button>

        {/* INDICADORES */}
        <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2">
          {slides.map((slide, index) => {
            const isActive =
              index === currentSlide;

            return (
              <button
                key={slide.id}
                type="button"
                onClick={() =>
                  setCurrentSlide(index)
                }
                aria-label={`Mostrar banner ${
                  index + 1
                }`}
                aria-current={
                  isActive
                    ? "true"
                    : undefined
                }
                className={`rounded-full transition-all ${
                  isActive
                    ? "h-2.5 w-8 bg-white"
                    : "h-2.5 w-2.5 bg-white/50 hover:bg-white/80"
                }`}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}