import { Link } from "react-router-dom";
import CourseHubLogo from "./logo/Logo";

const PLATFORM_LINKS = [
  { to: "/courses", label: "Cursos" },
  { to: "/portal", label: "Portal" },
  { to: "/about", label: "Sobre" },
  { to: "/fale-conosco", label: "Fale conosco" },
];

const LEGAL_LINKS = [
  { to: "/termos-de-uso", label: "Termos de uso" },
  { to: "/politica-de-privacidade", label: "Privacidade" },
  { to: "/documentos/verificar", label: "Verificar documento" },
];

function FooterLink({ to, children }) {
  return (
    <Link
      to={to}
      className="text-sm text-slate-300 transition hover:text-white"
    >
      {children}
    </Link>
  );
}

function LinkColumn({ title, links }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-300">
        {title}
      </p>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
          <li key={link.to}>
            <FooterLink to={link.to}>{link.label}</FooterLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SiteFooter({ variant = "public" }) {
  const year = new Date().getFullYear();
  const isApp = variant === "app";

  return (
    <footer
      className={`print-hide border-t border-white/10 bg-slate-950 text-slate-300 ${
        isApp ? "mt-10" : "mt-0"
      }`}
    >
      <div className="h-1 bg-gradient-to-r from-blue-600 via-orange-400 to-blue-600" />

      {isApp ? (
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <CourseHubLogo inverted width={148} className="h-auto" />
            <span className="hidden text-xs text-slate-500 sm:inline">
              Learn. Build. Grow.
            </span>
          </div>

          <nav
            aria-label="Links institucionais"
            className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm"
          >
            {LEGAL_LINKS.map((link) => (
              <FooterLink key={link.to} to={link.to}>
                {link.label}
              </FooterLink>
            ))}
          </nav>

          <p className="text-xs text-slate-500">
            © {year} CourseHub. Todos os direitos reservados.
          </p>
        </div>
      ) : (
        <>
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr] lg:px-8 lg:py-16">
            <div>
              <Link to="/" aria-label="Ir para a página inicial" className="inline-block">
                <CourseHubLogo inverted width={200} className="h-auto" />
              </Link>
              <p className="-mt-1 text-sm font-medium tracking-wide text-slate-400">
                Learn. Build. Grow.
              </p>
              <p className="mt-4 max-w-sm text-sm leading-6 text-slate-400">
                Ambiente de aprendizagem para organizar cursos, atividades,
                progresso e a vida acadêmica em um só lugar.
              </p>
            </div>

            <LinkColumn title="Plataforma" links={PLATFORM_LINKS} />
            <LinkColumn title="Institucional" links={LEGAL_LINKS} />
          </div>

          <div className="border-t border-white/10">
            <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
              <p>© {year} CourseHub. Todos os direitos reservados.</p>
              <p>Formação com clareza, do primeiro conteúdo à conclusão.</p>
            </div>
          </div>
        </>
      )}
    </footer>
  );
}
