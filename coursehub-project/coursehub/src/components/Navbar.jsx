import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu } from "lucide-react";
import CourseHubLogo from "./logo/Logo";
import MobileNavDrawer from "./MobileNavDrawer";

const NAV_LINKS = [
  { to: "/courses", label: "Cursos" },
  { to: "/portal", label: "Portal" },
  { to: "/about", label: "Sobre" },
  { to: "/fale-conosco", label: "Fale conosco" },
];

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const linkClass = ({ isActive }) =>
    `text-sm transition ${
      isActive
        ? "font-semibold text-blue-600"
        : "text-gray-600 hover:text-blue-600"
    }`;

  const mobileLinkClass = ({ isActive }) =>
    `block rounded-lg px-3 py-2.5 text-sm transition ${
      isActive
        ? "bg-blue-50 font-semibold text-blue-600"
        : "text-gray-700 hover:bg-gray-50 hover:text-blue-600"
    }`;

  return (
    <>
    <header className="sticky top-0 z-50 mb-6 border-b border-gray-200 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto grid max-w-[1500px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-4 py-4 sm:gap-8 sm:px-5">
        <Link
          to="/"
          aria-label="Ir para a página inicial"
          className="flex items-center gap-3 justify-self-start"
        >
          <div>
            <CourseHubLogo />

            <p className="-mt-2 text-center text-xs text-gray-500">
              Learn. Build. Grow.
            </p>
          </div>
        </Link>

        <nav className="hidden w-full items-center justify-center gap-12 lg:flex">
          {NAV_LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} className={linkClass}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center justify-end gap-2 font-pt text-semibold sm:gap-3">
          <Link
            to="/courses"
            className="hidden rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 lg:inline-flex"
          >
            Ver cursos
          </Link>

          <Link
            to="/login"
            className="hidden items-center justify-center rounded-full bg-gray-950 px-5 py-2.5 text-sm font-regular text-white transition hover:bg-gray-800 lg:inline-flex"
          >
            Entrar
          </Link>

          <button
            type="button"
            onClick={() => setIsMenuOpen(true)}
            aria-label="Abrir menu"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 transition hover:bg-gray-50 lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>

      <MobileNavDrawer
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        title="Menu"
        breakpointClass="lg:hidden"
      >
        <nav className="flex flex-col gap-1" aria-label="Navegação principal">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={mobileLinkClass}
              onClick={() => setIsMenuOpen(false)}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-4 flex flex-col gap-2 border-t border-gray-200 pt-4">
          <Link
            to="/courses"
            onClick={() => setIsMenuOpen(false)}
            className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-center text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
          >
            Ver cursos
          </Link>

          <Link
            to="/login"
            onClick={() => setIsMenuOpen(false)}
            className="rounded-full bg-gray-950 px-5 py-2.5 text-center text-sm font-regular text-white transition hover:bg-gray-800"
          >
            Entrar
          </Link>
        </div>
      </MobileNavDrawer>
    </>
  );
}