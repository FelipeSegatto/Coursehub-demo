import { NavLink, useLocation } from "react-router-dom";

export default function NavbarDropdown({ title, items }) {
  const location = useLocation();

  const hasActiveItem = items.some((item) =>
    location.pathname.startsWith(item.to)
  );

  return (
    <div className="group relative">
      <button
        type="button"
        className={`flex items-center gap-2 text-sm transition ${
          hasActiveItem
            ? "font-semibold text-blue-600"
            : "text-gray-600 hover:text-blue-600"
        }`}
      >
        {title}

        <svg
          className="h-4 w-4 transition-transform duration-200 group-hover:rotate-180"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      <div
        className="
          invisible absolute left-1/2 top-full z-50 mt-2
          w-64 -translate-x-1/2
          overflow-hidden rounded-xl
          border border-gray-200
          bg-white
          opacity-0
          shadow-xl
          transition-all duration-200
          group-hover:visible
          group-hover:opacity-100
        "
      >
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `block px-4 py-3 text-sm transition ${
                isActive
                  ? "bg-blue-50 font-semibold text-blue-600"
                  : "text-gray-700 hover:bg-gray-50 hover:text-blue-600"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}