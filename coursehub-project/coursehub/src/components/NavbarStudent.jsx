import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Menu, LogOut } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useUnreadNotifications } from "../hooks/useUnreadNotifications";
import { useChatUnreadCount } from "../hooks/useChatUnreadCount";
import CourseHubLogo from "./logo/Logo";
import NavbarDropdown from "./NavbarDropdown";
import MobileNavDrawer from "./MobileNavDrawer";

export default function NavbarStudent() {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { logout, estaLogado } = useAuth();
  const { unreadCount } = useUnreadNotifications({ enabled: estaLogado });
  const { unreadCount: unreadChatCount } = useChatUnreadCount({ enabled: estaLogado });

  const studiesItems = [
    {
      label: "Meus cursos",
      to: "/aluno/meus-cursos",
    },
    {
      label: "Atividades",
      to: "/aluno/atividades",
    },
    {
      label: "Avaliações",
      to: "/aluno/avaliacoes",
    },
    {
      label: "Notas",
      to: "/aluno/notas",
    },
    {
      label: "Frequência",
      to: "/aluno/frequencia",
    },
    {
      label: "Calendário",
      to: "/aluno/calendario",
    },
    {
      label: "Progresso",
      to: "/aluno/progresso",
    },
    {
      label: "Documentos",
      to: "/aluno/documentos",
    },
  ];

  async function handleLogout() {
    await logout();
    navigate("/", { replace: true });
  }

  const linkClass = ({ isActive }) =>
    `text-sm transition ${
      isActive
        ? "font-semibold text-blue-600"
        : "text-gray-600 hover:text-blue-600"
    }`;

  const mobileLinkClass = ({ isActive }) =>
    `flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition ${
      isActive
        ? "bg-blue-50 font-semibold text-blue-600"
        : "text-gray-700 hover:bg-gray-50 hover:text-blue-600"
    }`;

  function closeMenu() {
    setIsMenuOpen(false);
  }

  function handleMobileLogout() {
    closeMenu();
    handleLogout();
  }

  return (
    <>
    <header
      className="
        sticky top-0 z-50 mb-6
        border-b border-gray-200
        bg-white/85 backdrop-blur-xl
      "
    >
      <div
        className="
          mx-auto grid max-w-[1500px]
          grid-cols-[auto_minmax(0,1fr)_auto]
          items-center gap-4 sm:gap-8
          px-4 py-4 sm:px-5
        "
      >
        <Link
          to="/aluno"
          className="flex items-center gap-3 justify-self-start"
        >
          <div>
            <CourseHubLogo />

            <p className="-mt-2 text-center text-xs text-gray-500">
              Learn. Build. Grow.
            </p>
          </div>
        </Link>

        <nav
          className="
            hidden items-center justify-center
            gap-7 lg:flex
          "
          aria-label="Navegação do aluno"
        >
          <NavLink
            to="/aluno/dashboard-aluno"
            end
            className={linkClass}
          >
            Área do Aluno
          </NavLink>


          <NavbarDropdown
            title="Estudos"
            titleTo="/aluno/dashboard-aluno"
            items={studiesItems}
          />

          <NavLink
            to="/aluno/financeiro"
            className={linkClass}
          >
            Financeiro
          </NavLink>

          <NavLink
            to="/aluno/notificacoes"
            className={({ isActive }) => `relative ${linkClass({ isActive })}`}
          >
            Notificações
            {unreadCount > 0 && (
              <span
                className="
                  ml-1.5 inline-flex h-5 min-w-5 items-center justify-center
                  rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white
                "
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </NavLink>

          <NavLink
            to="/aluno/chat"
            className={({ isActive }) => `relative ${linkClass({ isActive })}`}
          >
            Chat
            {unreadChatCount > 0 && (
              <span
                className="
                  ml-1.5 inline-flex h-5 min-w-5 items-center justify-center
                  rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white
                "
              >
                {unreadChatCount > 99 ? "99+" : unreadChatCount}
              </span>
            )}
          </NavLink>
        </nav>

        <div className="flex items-center justify-end gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Sair"
            title="Sair"
            className="
              hidden h-11 w-11 items-center justify-center
              rounded-full border border-gray-200
              bg-white text-gray-700
              transition-all duration-200
              hover:-translate-y-0.5
              hover:border-red-200
              hover:bg-red-50
              hover:text-red-600
              hover:shadow-sm
              sm:flex
            "
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="
                  M10.5 6H6.75
                  A2.25 2.25 0 0 0 4.5 8.25
                  v7.5
                  A2.25 2.25 0 0 0 6.75 18
                  h3.75
                  M15 15.75 18.75 12 15 8.25
                  M18.75 12H9
                "
              />
            </svg>
          </button>

          <Link
            to="/aluno/perfil"
            className="
              hidden h-10 items-center gap-2
              rounded-full bg-slate-950 px-5
              text-sm font-medium text-white
              transition-all duration-200
              hover:-translate-y-0.5
              hover:bg-slate-800
              hover:shadow-lg
              hover:shadow-slate-950/15
              lg:flex
            "
          >
            Meu perfil

            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-4 w-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m9 18 6-6-6-6"
              />
            </svg>
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
        onClose={closeMenu}
        title="Menu do aluno"
      >
        <nav className="flex flex-col gap-1" aria-label="Navegação do aluno">
          <NavLink to="/aluno/dashboard-aluno" end className={mobileLinkClass} onClick={closeMenu}>
            Área do Aluno
          </NavLink>

          <p className="mt-3 px-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Estudos
          </p>

          {studiesItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={mobileLinkClass} onClick={closeMenu}>
              {item.label}
            </NavLink>
          ))}

          <p className="mt-3 px-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Conta
          </p>

          <NavLink to="/aluno/financeiro" className={mobileLinkClass} onClick={closeMenu}>
            Financeiro
          </NavLink>

          <NavLink to="/aluno/notificacoes" className={mobileLinkClass} onClick={closeMenu}>
            Notificações
            {unreadCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </NavLink>

          <NavLink to="/aluno/chat" className={mobileLinkClass} onClick={closeMenu}>
            Chat
            {unreadChatCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">
                {unreadChatCount > 99 ? "99+" : unreadChatCount}
              </span>
            )}
          </NavLink>

          <NavLink to="/aluno/perfil" className={mobileLinkClass} onClick={closeMenu}>
            Meu perfil
          </NavLink>
        </nav>

        <button
          type="button"
          onClick={handleMobileLogout}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sair
        </button>
      </MobileNavDrawer>
    </>
  );
}