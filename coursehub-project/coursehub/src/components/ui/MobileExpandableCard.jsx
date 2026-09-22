import { useState } from "react";
import { ChevronDown } from "lucide-react";

export default function MobileExpandableCard({
  title,
  subtitle,
  badge,
  primaryAction,
  children,
  defaultOpen = false,
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const hasDetails = Boolean(children);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => hasDetails && setIsOpen((open) => !open)}
        aria-expanded={hasDetails ? isOpen : undefined}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{title}</p>
          {subtitle && <p className="mt-0.5 truncate text-xs text-gray-500">{subtitle}</p>}
        </div>

        {badge}

        {hasDetails && (
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        )}
      </button>

      {primaryAction && (
        <div className="border-t border-gray-100 px-4 py-3">{primaryAction}</div>
      )}

      {hasDetails && isOpen && (
        <div className="space-y-2 border-t border-gray-100 bg-gray-50 px-4 py-3">
          {children}
        </div>
      )}
    </div>
  );
}
