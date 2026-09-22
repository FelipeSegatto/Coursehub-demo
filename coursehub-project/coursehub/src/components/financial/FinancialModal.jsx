import { useEffect } from "react";

export default function FinancialModal({
  open,
  title,
  description,
  children,
  onClose,
  onSubmit,
  submitLabel = "Confirmar",
  submitDisabled = false,
  loading = false,
  danger = false,
}) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape" && !loading) {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyDown
      );

      document.body.style.overflow = "";
    };
  }, [open, loading, onClose]);

  if (!open) {
    return null;
  }

  function handleBackdropClick(event) {
    if (
      event.target === event.currentTarget &&
      !loading
    ) {
      onClose();
    }
  }

  return (
    <div
      role="presentation"
      onMouseDown={handleBackdropClick}
      className={[
        "fixed inset-0 z-50",
        "flex items-center justify-center",
        "bg-slate-950/50 p-4",
        "backdrop-blur-sm",
      ].join(" ")}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="financial-modal-title"
        className={[
          "max-h-[90vh] w-full max-w-lg",
          "overflow-y-auto rounded-2xl",
          "border border-slate-200",
          "bg-white shadow-2xl",
        ].join(" ")}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2
              id="financial-modal-title"
              className="text-lg font-semibold text-slate-900"
            >
              {title}
            </h2>

            {description && (
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {description}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Fechar modal"
            className={[
              "flex h-9 w-9 shrink-0",
              "items-center justify-center rounded-lg",
              "text-xl text-slate-400 transition",
              "hover:bg-slate-100 hover:text-slate-700",
              "disabled:cursor-not-allowed",
              "disabled:opacity-40",
            ].join(" ")}
          >
            ×
          </button>
        </header>

        <form onSubmit={onSubmit}>
          <div className="space-y-4 px-5 py-5">
            {children}
          </div>

          <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className={[
                "inline-flex min-h-10 items-center",
                "justify-center rounded-lg",
                "border border-slate-300 bg-white px-4",
                "text-sm font-semibold text-slate-700",
                "transition hover:bg-slate-100",
                "disabled:cursor-not-allowed",
                "disabled:opacity-50",
              ].join(" ")}
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={submitDisabled || loading}
              className={[
                "inline-flex min-h-10 items-center",
                "justify-center gap-2 rounded-lg px-4",
                "text-sm font-semibold text-white",
                "transition",
                danger
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-blue-600 hover:bg-blue-700",
                "disabled:cursor-not-allowed",
                "disabled:opacity-50",
              ].join(" ")}
            >
              {loading && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              )}

              {loading ? "Processando..." : submitLabel}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}