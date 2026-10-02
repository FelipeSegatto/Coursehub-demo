import { NavLink } from "react-router-dom";

const MODES = [
  { to: "/admin/chat", label: "Atendimento", end: true },
  { to: "/admin/chat/supervisao", label: "Supervisão" },
];

export default function AdminChatModeNav() {
  return (
    <nav aria-label="Áreas do chat" className="mb-4 flex gap-1">
      {MODES.map((mode) => (
        <NavLink
          key={mode.to}
          to={mode.to}
          end={mode.end}
          className={({ isActive }) =>
            `rounded-lg px-3 py-2 text-sm font-semibold transition ${
              isActive ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
            }`
          }
        >
          {mode.label}
        </NavLink>
      ))}
    </nav>
  );
}
