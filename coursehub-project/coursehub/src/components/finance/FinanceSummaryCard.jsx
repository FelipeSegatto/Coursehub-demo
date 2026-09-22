export default function FinanceSummaryCard({
  label,
  value,
  helperText,
  icon,
  variant = "default",
}) {
  const variants = {
    default: "border-slate-200 bg-white",
    primary: "border-blue-200 bg-blue-50",
    success: "border-emerald-200 bg-emerald-50",
    warning: "border-amber-200 bg-amber-50",
    danger: "border-red-200 bg-red-50",
  };

  return (
    <article
      className={`rounded-2xl border p-5 ${variants[variant] || variants.default}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {label}
          </p>

          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            {value}
          </p>

          {helperText && (
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {helperText}
            </p>
          )}
        </div>

        {icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70 text-slate-700">
            {icon}
          </div>
        )}
      </div>
    </article>
  );
}