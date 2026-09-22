import { Link } from "react-router-dom";

function QuickActionsCard({
  title,
  description,
  icon,
  to,
  onClick,
  disabled = false,
  disabledReason,
}) {
  const baseClassName =
    "block w-full rounded-xl border border-gray-200 p-4 text-left transition";

  const content = (
    <>
      {icon && (
        <span className="mb-2 block text-xl" aria-hidden="true">
          {icon}
        </span>
      )}

      <h3 className="font-semibold text-gray-900">{title}</h3>

      <p className="mt-2 text-sm text-gray-600">{description}</p>

      {disabled && disabledReason && (
        <p className="mt-2 text-xs text-gray-400">{disabledReason}</p>
      )}
    </>
  );

  if (disabled) {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        title={disabledReason}
        className={`${baseClassName} cursor-not-allowed opacity-60`}
      >
        {content}
      </button>
    );
  }

  if (to) {
    return (
      <Link to={to} className={`${baseClassName} hover:bg-gray-50`}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClassName} hover:bg-gray-50`}
    >
      {content}
    </button>
  );
}

export default QuickActionsCard;
