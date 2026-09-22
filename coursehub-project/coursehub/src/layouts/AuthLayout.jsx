import { Outlet, useLocation } from "react-router-dom";
import CourseHubLogo from "../components/logo/Logo";
import loginBackground from "../assets/login-bg.webp";

const AUTH_COPY_BY_PATH = {
  "/login": {
    eyebrow: "Ambiente de aprendizagem",
    title: "Conhecimento ganha forma quando encontra espaço para crescer.",
    description:
      "Acesse seus cursos, acompanhe seu progresso e continue exatamente de onde parou.",
  },
  "/register": {
    eyebrow: "Matrícula",
    title: "A conta do aluno nasce junto com o contrato.",
    description:
      "Escolha um curso e avance no checkout. Não há cadastro avulso na plataforma.",
  },
  "/esqueci-minha-senha": {
    eyebrow: "Recuperação de acesso",
    title: "Recupere seu acesso e continue sua jornada.",
    description:
      "Informe o e-mail associado à sua conta para receber as instruções de redefinição de senha.",
  },
  "/redefinir-senha": {
    eyebrow: "Segurança da conta",
    title: "Recomece com segurança e continue de onde parou.",
    description:
      "Defina uma nova senha para recuperar o acesso à sua conta e continuar sua jornada no CourseHub.",
  },
};

const DEFAULT_AUTH_COPY = {
  eyebrow: "CourseHub",
  title: "Aprender também é encontrar novas perspectivas.",
  description: "Acesse sua conta e continue sua jornada de aprendizagem.",
};

export default function AuthLayout() {
  const { pathname } = useLocation();
  const { eyebrow, title, description } =
    AUTH_COPY_BY_PATH[pathname] || DEFAULT_AUTH_COPY;

  return (
    <main className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[1.1fr_0.9fr]">
      {/* Área visual */}
      <section className="relative hidden min-h-screen overflow-hidden lg:block">
        <img
          src={loginBackground}
          alt=""
          fetchPriority="high"
          loading="eager"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-left"
        />

        <div className="absolute inset-0 bg-slate-950/20" />

        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/15 to-transparent" />

        <div
          className="
            absolute inset-0 opacity-20
            bg-[linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)]
            bg-[size:72px_72px]
          "
        />

        <div className="relative flex min-h-screen flex-col justify-between p-10 xl:p-14">
          <div>
            <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-sm">
              {eyebrow}
            </span>
          </div>

          <div className="max-w-xl">
            <div className="mb-6 h-px w-16 bg-white/60" />

            <h2 className="text-4xl font-semibold leading-tight tracking-tight text-white xl:text-5xl">
              {title}
            </h2>

            <p className="mt-5 max-w-lg text-base leading-7 text-slate-200">
              {description}
            </p>
          </div>
        </div>
      </section>

      {/* Área do formulário */}
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-md">
          <div className="mb-10">
            <CourseHubLogo
              width={210}
              className="h-auto max-w-full"
            />
          </div>

          <Outlet />
        </div>
      </section>
    </main>
  );
}