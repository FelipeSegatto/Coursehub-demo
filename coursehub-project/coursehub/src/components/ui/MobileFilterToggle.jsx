import { useState } from "react";
import { SlidersHorizontal, ChevronDown } from "lucide-react";

/**
 * Em telas pequenas, várias `<select>`/inputs de filtro lado a lado
 * (ou empilhadas em largura total) tomam a tela toda antes mesmo de
 * mostrar a lista. Este componente mantém o layout desktop (children
 * renderizados lado a lado, sem alterações) e, no mobile, esconde os
 * filtros atrás de um botão "Filtros" colapsável -- os mesmos
 * controles (mesmo value/onChange) só aparecem duplicados no DOM
 * para simplificar; não há duplicação de estado.
 */
export default function MobileFilterToggle({ children, activeCount = 0, label = "Filtros" }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className="hidden flex-wrap gap-3 md:flex">{children}</div>

      <div className="w-full md:hidden">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700"
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal size={16} aria-hidden="true" />
            {label}
            {activeCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-100 px-1.5 text-xs font-semibold text-blue-700">
                {activeCount}
              </span>
            )}
          </span>

          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>

        {isOpen && <div className="mt-3 flex flex-col gap-3">{children}</div>}
      </div>
    </>
  );
}
