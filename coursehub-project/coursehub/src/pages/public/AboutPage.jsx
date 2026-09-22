import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  Layers3,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

const principles = [
  {
    id: 1,
    icon: LayoutDashboard,
    title: "Clareza antes de complexidade",
    description:
      "Informações importantes precisam estar acessíveis, organizadas e fáceis de compreender. A tecnologia deve simplificar a experiência, não criar novas barreiras.",
  },
  {
    id: 2,
    icon: Layers3,
    title: "Tudo conectado",
    description:
      "Cursos, conteúdos, atividades, avaliações, progresso e informações acadêmicas fazem parte da mesma jornada e devem funcionar de forma integrada.",
  },
  {
    id: 3,
    icon: Users,
    title: "Experiências para cada perfil",
    description:
      "Alunos, professores e administradores possuem necessidades diferentes. Cada área da plataforma foi pensada para apoiar essas responsabilidades.",
  },
  {
    id: 4,
    icon: ShieldCheck,
    title: "Estrutura confiável",
    description:
      "Segurança, permissões e organização dos dados são partes essenciais da experiência, não detalhes adicionados apenas ao final do desenvolvimento.",
  },
];

const audiences = [
  {
    id: 1,
    icon: GraduationCap,
    label: "Para alunos",
    title: "Uma jornada de aprendizado mais clara",
    description:
      "O aluno encontra seus cursos, conteúdos, atividades, avaliações, notas e progresso em um ambiente único e organizado.",
    items: [
      "Acesso aos cursos matriculados",
      "Conteúdos em diferentes formatos",
      "Atividades e avaliações centralizadas",
      "Acompanhamento de progresso",
      "Informações acadêmicas e financeiras",
    ],
  },
  {
    id: 2,
    icon: BookOpen,
    label: "Para professores",
    title: "Mais organização para ensinar",
    description:
      "O professor pode administrar conteúdos, acompanhar turmas, revisar submissões e registrar resultados sem depender de ferramentas desconectadas.",
    items: [
      "Gerenciamento de conteúdos",
      "Criação de atividades e avaliações",
      "Acompanhamento das turmas",
      "Correção de submissões",
      "Registro de notas e frequência",
    ],
  },
  {
    id: 3,
    icon: LayoutDashboard,
    label: "Para administradores",
    title: "Uma visão completa da operação",
    description:
      "A área administrativa reúne os principais dados acadêmicos e operacionais para facilitar o gerenciamento da instituição.",
    items: [
      "Gerenciamento de usuários",
      "Administração de cursos",
      "Organização de alunos e professores",
      "Controle de acessos e permissões",
      "Acompanhamento da operação",
    ],
  },
];

export default function AboutPage() {
  return (
    <main className="bg-white">
      {/* HERO */}
      {/* HERO */}
      <section className="relative isolate overflow-hidden bg-[#0f6f7f]">
        {/* Imagem */}
        <img
          src="/images/about-coursehub-hero.webp"
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          loading="eager"
          decoding="async"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-right"
        />

        {/* Overlay para contraste do texto */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/80 via-slate-950/35 to-transparent" />

        {/* leve camada geral para integrar a foto */}
        <div className="absolute inset-0 bg-black/5" />

        <div className="relative mx-auto flex min-h-[520px] max-w-7xl items-center px-6 py-16 sm:min-h-[560px] lg:min-h-[620px] lg:px-8 lg:py-20">
          <div className="max-w-[650px]">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-cyan-50 backdrop-blur-sm">
              <Sparkles size={16} />
              Sobre o CourseHub
            </div>

            <h1 className="mt-7 max-w-[620px] text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Educação mais clara.
              <span className="block">
                Experiências mais conectadas.
              </span>
            </h1>

            <p className="mt-6 max-w-[560px] text-base leading-7 text-cyan-50/90 sm:text-lg sm:leading-8">
              O CourseHub reúne aprendizagem, acompanhamento e gestão em uma
              experiência digital simples, organizada e preparada para evoluir.
            </p>
          </div>
        </div>
      </section>

      {/* PROBLEMA E PROPÓSITO */}
      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
        <div className="grid gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">
              Por que existimos
            </p>

            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              Educação não deveria parecer uma coleção de sistemas separados.
            </h2>
          </div>

          <div className="space-y-6 text-base leading-8 text-slate-600">
            <p>
              Em muitas experiências educacionais, conteúdos ficam em um
              lugar, atividades em outro, notas em planilhas, mensagens em
              diferentes canais e informações administrativas espalhadas por
              várias ferramentas.
            </p>

            <p>
              O resultado é uma jornada fragmentada: alunos perdem clareza,
              professores acumulam tarefas operacionais e administradores têm
              dificuldade para acompanhar o que acontece na plataforma.
            </p>

            <p className="font-medium text-slate-900">
              O CourseHub busca resolver esse problema conectando todas essas
              partes em um ambiente único, acessível e coerente.
            </p>
          </div>
        </div>
      </section>

      {/* PRINCÍPIOS */}
      {/* PRINCÍPIOS */}
      <section className="relative overflow-hidden border-y border-slate-800 bg-slate-950">
        {/* Background do hero antigo */}
        <div className="absolute inset-0">
          <div className="absolute -left-32 top-10 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />

          <div className="absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />

          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:64px_64px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-24">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-300">
              Nossos princípios
            </p>

            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Uma plataforma educacional precisa ser útil antes de parecer
              complexa.
            </h2>

            <p className="mt-5 text-base leading-7 text-slate-300">
              Cada decisão do produto parte de princípios que orientam a
              experiência, a arquitetura e a evolução da plataforma.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {principles.map((principle) => {
              const Icon = principle.icon;

              return (
                <article
                  key={principle.id}
                  className="rounded-2xl border border-white/10 bg-white/95 p-7 shadow-xl shadow-black/10 backdrop-blur-sm"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                    <Icon size={22} />
                  </div>

                  <h3 className="mt-6 text-lg font-semibold text-slate-950">
                    {principle.title}
                  </h3>

                  <p className="mt-3 text-sm leading-7 text-slate-600">
                    {principle.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* PERFIS */}
      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">
            Uma plataforma, diferentes experiências
          </p>

          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
            Cada pessoa encontra exatamente o que precisa para continuar.
          </h2>

          <p className="mt-5 text-base leading-7 text-slate-600">
            O CourseHub possui áreas independentes para alunos, professores e
            administradores, preservando uma experiência consistente em toda a
            plataforma.
          </p>
        </div>

        <div className="mt-12 space-y-6">
          {audiences.map((audience, index) => {
            const Icon = audience.icon;
            const isReversed = index % 2 !== 0;

            return (
              <article
                key={audience.id}
                className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white"
              >
                <div
                  className={`grid lg:grid-cols-2 ${
                    isReversed ? "lg:[&>*:first-child]:order-2" : ""
                  }`}
                >
                  <div className="flex min-h-[360px] items-center bg-slate-950 p-8 md:p-12">
                    <div>
                      <div className="flex h-13 w-13 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-300">
                        <Icon size={25} />
                      </div>

                      <p className="mt-8 text-sm font-semibold uppercase tracking-[0.18em] text-blue-300">
                        {audience.label}
                      </p>

                      <h3 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                        {audience.title}
                      </h3>

                      <p className="mt-5 max-w-lg text-base leading-7 text-slate-300">
                        {audience.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center p-8 md:p-12">
                    <div className="w-full">
                      <p className="text-sm font-semibold text-slate-900">
                        Principais recursos
                      </p>

                      <div className="mt-6 space-y-4">
                        {audience.items.map((item) => (
                          <div
                            key={item}
                            className="flex items-start gap-3 border-b border-slate-100 pb-4 last:border-b-0"
                          >
                            <CheckCircle2
                              size={19}
                              className="mt-0.5 shrink-0 text-blue-700"
                            />

                            <p className="text-sm leading-6 text-slate-700">
                              {item}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* VISÃO */}
      <section className="relative overflow-hidden bg-blue-700">
        {/* BACKGROUND */}
        <img
          src="/images/login-bg.webp"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="
            pointer-events-none
            absolute
            inset-0
            h-full
            w-full
            object-cover
            object-center
          "
        />

        {/* CAMADA AZUL PARA INTEGRAR A IMAGEM AO DESIGN */}
        <div className="absolute inset-0 bg-blue-800/55" />

        {/* GRADIENTE PARA GARANTIR LEITURA DO TEXTO */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-950/80 via-blue-800/45 to-blue-700/20" />

        <div className="relative mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-[1fr_0.85fr] lg:items-center lg:px-8 lg:py-24">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-200">
              Nossa visão
            </p>

            <h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Construir uma experiência educacional que cresça sem perder a
              simplicidade.
            </h2>

            <p className="mt-6 max-w-2xl text-base leading-8 text-blue-100">
              O CourseHub foi projetado para evoluir continuamente. Novos
              recursos podem ser incorporados sem fragmentar a experiência ou
              tornar a plataforma mais difícil de usar.
            </p>
          </div>

          <div className="rounded-[2rem] border border-white/20 bg-slate-950/25 p-8 shadow-2xl backdrop-blur-md">
            <p className="text-lg font-semibold text-white">
              O que buscamos preservar
            </p>

            <div className="mt-6 space-y-5">
              {[
                "Uma navegação clara e previsível.",
                "Informações organizadas em torno da jornada do usuário.",
                "Recursos que resolvem necessidades reais.",
                "Uma arquitetura preparada para crescer.",
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-start gap-3"
                >
                  <CheckCircle2
                    size={20}
                    className="mt-0.5 shrink-0 text-blue-200"
                  />

                  <p className="text-sm leading-6 text-blue-50">
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
        <div className="overflow-hidden rounded-[2rem] bg-slate-950 px-7 py-12 text-center md:px-16 md:py-16">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-blue-300">
            <BookOpen size={23} />
          </div>

          <h2 className="mx-auto mt-6 max-w-2xl text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Conheça os cursos disponíveis no CourseHub
          </h2>

          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-300">
            Explore o catálogo e encontre uma formação alinhada aos seus
            objetivos.
          </p>

          <Link
            to="/courses"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
          >
            Explorar cursos
            <ArrowRight size={17} />
          </Link>
        </div>
      </section>
    </main>
  );
}