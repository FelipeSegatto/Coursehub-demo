import { Link } from "react-router-dom";

/**
 * `to` is optional -- when omitted, renders exactly as before (a
 * plain, non-interactive div), so every existing call site keeps
 * working unchanged. When passed, the whole card becomes a single
 * `Link` (never window.location), with its own hover/focus styling --
 * no business logic lives here, callers decide the destination.
 */
function StatCard({ title, value, color = "blue", to }) {
  const colors = {
    blue: "text-blue-600",
    ink: "text-slate-950",
    green: "text-green-600",
    red: "text-red-600",
    yellow: "text-yellow-600",
    purple: "text-purple-600",
  };

  const content = (
    <>
      <p className="text-sm text-gray-500">
        {title}
      </p>

      <p className={`mt-2 text-3xl font-bold ${colors[color]}`}>
        {value}
      </p>
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="block rounded-2xl bg-white p-6 shadow outline-none transition hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow">
      {content}
    </div>
  );
}

export default StatCard;