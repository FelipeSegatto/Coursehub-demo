import { Check } from "lucide-react";

/**
 * Indicador de progresso do checkout público (5 etapas). `currentIndex`
 * é a posição (0-based) da etapa ativa em `steps`; etapas anteriores
 * aparecem concluídas (check), a atual em destaque, as seguintes neutras.
 */
export default function CheckoutStepper({ steps, currentIndex }) {
  return (
    <ol className="flex items-start">
      {steps.map((label, index) => {
        const isComplete = index < currentIndex;
        const isCurrent = index === currentIndex;
        const reached = isComplete || isCurrent;

        return (
          <li key={label} className="flex min-w-0 flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <span
                className={`h-px flex-1 ${
                  index === 0 ? "bg-transparent" : reached ? "bg-slate-950" : "bg-slate-200"
                }`}
                aria-hidden="true"
              />
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
                  reached
                    ? "bg-slate-950 text-white"
                    : "border border-slate-300 bg-white text-slate-400"
                }`}
              >
                {isComplete ? <Check size={13} strokeWidth={2.5} aria-hidden="true" /> : index + 1}
              </span>
              <span
                className={`h-px flex-1 ${
                  index === steps.length - 1 ? "bg-transparent" : isComplete ? "bg-slate-950" : "bg-slate-200"
                }`}
                aria-hidden="true"
              />
            </div>

            <span
              className={`mt-2.5 hidden px-1 text-center text-[10px] font-medium uppercase tracking-[0.14em] sm:block ${
                isCurrent ? "text-slate-950" : "text-slate-400"
              }`}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
