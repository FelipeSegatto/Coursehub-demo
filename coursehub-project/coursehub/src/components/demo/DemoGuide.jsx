import { useEffect, useState } from "react";
import { DEMO_ACCOUNTS, DEMO_EXPLORE_NOTE, DEMO_PASSWORD, DEMO_STEPS } from "../../constants/demoGuide";

const STORAGE_KEY = "coursehub.demoGuide.dismissed";

export default function DemoGuide({ variant = "floating", onUseAccount }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (variant !== "login") return;
    if (window.localStorage.getItem(STORAGE_KEY) === "1") return;
    setOpen(true);
  }, [variant]);

  function handleClose() {
    setOpen(false);
    window.localStorage.setItem(STORAGE_KEY, "1");
  }

  return (
    <>
      {variant === "floating" && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="print-hide fixed bottom-5 left-5 z-40 rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-800"
        >
          Roteiro da demo
        </button>
      )}

      {variant === "login" && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-6 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          Ver roteiro e contas da demo
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Demonstração</p>
                <h2 className="mt-1 text-xl font-bold text-gray-900">Roteiro sugerido</h2>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="text-gray-400 transition hover:text-gray-700"
                aria-label="Fechar roteiro"
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-gray-600">
              Cinco contas, uma senha:{" "}
              <span className="font-mono text-gray-900">{DEMO_PASSWORD}</span>.
              Siga o roteiro ou explore à vontade.
            </p>

            <ul className="mt-4 space-y-2">
              {DEMO_ACCOUNTS.map((account) => (
                <li key={account.id} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{account.role}</p>
                      <p className="font-medium text-gray-900">{account.name}</p>
                      <p className="font-mono text-xs text-gray-600">{account.email}</p>
                    </div>
                    {onUseAccount && (
                      <button
                        type="button"
                        onClick={() => {
                          onUseAccount({ email: account.email, password: DEMO_PASSWORD });
                          handleClose();
                        }}
                        className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-blue-700 shadow-sm ring-1 ring-blue-100 transition hover:bg-blue-50"
                      >
                        Usar
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{account.summary}</p>
                </li>
              ))}
            </ul>

            <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm text-gray-700">
              {DEMO_STEPS.map((step) => (
                <li key={step.title}>
                  <span className="font-semibold">{step.title}.</span> {step.detail}
                </li>
              ))}
            </ol>

            <p className="mt-5 text-xs leading-5 text-gray-500">{DEMO_EXPLORE_NOTE}</p>

            <button
              type="button"
              onClick={handleClose}
              className="mt-5 w-full rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Fechar e explorar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
