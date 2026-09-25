import { useEffect, useState } from "react";
import {
  Bell,
  Check,
  Compass,
  Copy,
  GraduationCap,
  QrCode,
  Sparkles,
  X,
} from "lucide-react";
import { DEMO_ACCOUNTS, DEMO_EXPLORE_NOTE, DEMO_PASSWORD, DEMO_STEPS } from "../../constants/demoGuide";

const STORAGE_KEY = "coursehub.demoGuide.dismissed";

const ACCOUNT_LOOK = {
  "student-a": {
    Icon: GraduationCap,
    bar: "bg-emerald-400",
    avatar: "from-emerald-400 to-teal-600",
    pill: "bg-emerald-50 text-emerald-800 ring-emerald-100",
    moment: "bg-emerald-50 text-emerald-700",
    use: "text-emerald-800 hover:bg-emerald-50",
  },
  "student-b": {
    Icon: QrCode,
    bar: "bg-rose-400",
    avatar: "from-rose-400 to-orange-500",
    pill: "bg-rose-50 text-rose-800 ring-rose-100",
    moment: "bg-rose-50 text-rose-700",
    use: "text-rose-800 hover:bg-rose-50",
  },
  teacher: {
    Icon: Compass,
    bar: "bg-sky-400",
    avatar: "from-sky-400 to-indigo-600",
    pill: "bg-sky-50 text-sky-800 ring-sky-100",
    moment: "bg-sky-50 text-sky-700",
    use: "text-sky-800 hover:bg-sky-50",
  },
  admin: {
    Icon: Bell,
    bar: "bg-amber-400",
    avatar: "from-amber-400 to-orange-500",
    pill: "bg-amber-50 text-amber-900 ring-amber-100",
    moment: "bg-amber-50 text-amber-800",
    use: "text-amber-900 hover:bg-amber-50",
  },
};

export default function DemoGuide({ variant = "floating", onUseAccount }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (variant !== "login") return;
    if (window.localStorage.getItem(STORAGE_KEY) === "1") return;
    setOpen(true);
  }, [variant]);

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") handleClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  function handleClose() {
    setOpen(false);
    window.localStorage.setItem(STORAGE_KEY, "1");
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(DEMO_PASSWORD);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function handleBackdrop(event) {
    if (event.target === event.currentTarget) handleClose();
  }

  return (
    <>
      {variant === "floating" && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="print-hide group fixed bottom-5 left-5 z-40 flex items-center gap-2.5 rounded-full bg-slate-950 py-2 pl-2 pr-4 text-white shadow-[0_16px_40px_rgba(15,23,42,0.28)] transition hover:-translate-y-0.5 hover:bg-slate-800"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-white shadow-inner">
            <Sparkles size={15} aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold tracking-tight">Roteiro</span>
        </button>
      )}

      {variant === "login" && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group mt-6 flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-sm transition hover:border-sky-200 hover:bg-sky-50/60"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 text-white">
            <Sparkles size={18} aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-slate-900">Ver roteiro da demo</span>
            <span className="mt-0.5 block text-xs text-slate-500">Um caminho sugerido para conhecer o CourseHub por diferentes perspectivas.</span>
          </span>
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-4 backdrop-blur-sm sm:items-center sm:p-8"
          onMouseDown={handleBackdrop}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="demo-guide-title"
            className="animate-demo-guide flex max-h-[92vh] w-full min-w-0 max-w-[760px] flex-col overflow-hidden rounded-[28px] bg-stone-50 shadow-[0_32px_80px_rgba(15,23,42,0.28)]"
          >
            <header className="relative shrink-0 overflow-hidden bg-slate-950 px-6 pb-7 pt-6 text-white sm:px-9 sm:pb-8 sm:pt-8">
              <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-sky-400/25 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-20 left-10 h-40 w-40 rounded-full bg-amber-400/20 blur-3xl" />

              <div className="relative flex items-start justify-between gap-5">
                <div className="min-w-0">
                  <p className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-100">
                    <Sparkles size={11} aria-hidden="true" />
                    Demonstração
                  </p>
                  <h2
                    id="demo-guide-title"
                    className="mt-4 text-balance font-unit text-[1.65rem] font-semibold leading-[1.15] tracking-tight sm:text-[2rem]"
                  >
                    Quatro papéis. Uma escola.
                  </h2>
                  <p className="mt-3 max-w-md text-sm leading-7 text-slate-300">
                    Entre como alguém da história — ou só passeie. A senha é a mesma para todos.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleClose}
                  className="relative z-10 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
                  aria-label="Fechar roteiro"
                >
                  <X size={18} />
                </button>
              </div>

              <button
                type="button"
                onClick={copyPassword}
                className="relative mt-7 inline-flex max-w-full items-center gap-2.5 rounded-full border border-white/15 bg-white/10 px-4 py-2.5 text-left transition hover:bg-white/15"
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Senha
                </span>
                <span className="truncate font-mono text-sm text-white">{DEMO_PASSWORD}</span>
                {copied ? (
                  <>
                    <Check size={15} className="shrink-0 text-emerald-300" aria-hidden="true" />
                    <span className="text-[11px] font-semibold text-emerald-300">Copiada</span>
                  </>
                ) : (
                  <>
                    <Copy size={15} className="shrink-0 text-slate-300" aria-hidden="true" />
                    <span className="hidden text-[11px] font-medium text-slate-400 sm:inline">Copiar</span>
                  </>
                )}
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-7 sm:px-9 sm:py-8">
              <ul className="grid gap-5">
                {DEMO_ACCOUNTS.map((account) => {
                  const look = ACCOUNT_LOOK[account.id];
                  const Icon = look.Icon;

                  return (
                    <li
                      key={account.id}
                      className="relative overflow-hidden rounded-2xl bg-white p-5 shadow-[0_1px_0_rgba(15,23,42,0.04)] ring-1 ring-slate-200/80 sm:p-6"
                    >
                      <span className={`absolute inset-y-5 left-0 w-1 rounded-full ${look.bar}`} />

                      <div className="flex items-start gap-4 pl-3">
                        <span
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-sm ${look.avatar}`}
                          aria-hidden="true"
                        >
                          <Icon size={20} strokeWidth={2.1} />
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 ${look.pill}`}>
                              {account.role}
                            </p>
                            <p className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${look.moment}`}>
                              {account.moment}
                            </p>
                          </div>
                          <p className="mt-2.5 font-semibold tracking-tight text-slate-950">{account.name}</p>
                          <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">{account.email}</p>
                        </div>

                        {onUseAccount && (
                          <button
                            type="button"
                            onClick={() => {
                              onUseAccount({ email: account.email, password: DEMO_PASSWORD });
                              handleClose();
                            }}
                            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-slate-200/80 transition ${look.use}`}
                          >
                            Entrar
                          </button>
                        )}
                      </div>

                      <p className="mt-4 pl-3 text-[13px] leading-7 text-slate-600">{account.summary}</p>
                    </li>
                  );
                })}
              </ul>

              <section className="mt-10">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Passeio sugerido
                </p>
                <ol className="mt-5 space-y-0">
                  {DEMO_STEPS.map((step, index) => (
                    <li key={step.title} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-[11px] font-bold text-white">
                          {index + 1}
                        </span>
                        {index < DEMO_STEPS.length - 1 && (
                          <span className="my-1.5 w-px flex-1 bg-gradient-to-b from-slate-300 to-slate-200" />
                        )}
                      </div>
                      <div className={index < DEMO_STEPS.length - 1 ? "pb-6" : "pb-0"}>
                        <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                        <p className="mt-1.5 text-[13px] leading-7 text-slate-600">{step.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              <p className="mt-8 flex gap-2.5 text-xs leading-6 text-slate-500">
                <Compass size={14} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
                {DEMO_EXPLORE_NOTE}
              </p>
            </div>

            <div className="shrink-0 border-t border-slate-200/80 bg-white px-6 py-5 sm:px-9 sm:py-6">
              <button
                type="button"
                onClick={handleClose}
                className="flex h-12 w-full items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Fechar e explorar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
