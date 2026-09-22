import { Check } from "lucide-react";

/**
 * Indicador de progresso do checkout público (5 etapas). `currentIndex`
 * é a posição (0-based) da etapa ativa em `steps`; etapas anteriores
 * aparecem concluídas (check), a atual em destaque, as seguintes neutras.
 * Puramente visual -- não guarda estado, o wizard continua controlando
 * a navegação via `phase`.
 */
export default function CheckoutStepper({ steps, currentIndex }) {
  return (
    <ol className="flex items-start gap-1.5 sm:gap-2">
      {steps.map((label, index) => {
        const isComplete = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <li key={label} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex w-full items-center">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition ${
                  isComplete
                    ? "bg-blue-600 text-white"
                    : isCurrent
                    ? "bg-slate-950 text-white ring-4 ring-slate-950/10"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                {isComplete ? <Check size={15} aria-hidden="true" /> : index + 1}
              </span>

              {index < steps.length - 1 && (
                <span
                  className={`ml-1.5 h-px flex-1 sm:ml-2 ${isComplete ? "bg-blue-600" : "bg-slate-200"}`}
                  aria-hidden="true"
                />
              )}
            </div>

            <span
              className={`hidden text-center text-[11px] font-medium leading-tight sm:block ${
                isCurrent ? "text-slate-950" : isComplete ? "text-slate-600" : "text-slate-400"
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
