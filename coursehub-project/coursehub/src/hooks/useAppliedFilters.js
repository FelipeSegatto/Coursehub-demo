import { useCallback, useState } from "react";

/**
 * Mecânica compartilhada de "rascunho de filtros vs. filtros
 * aplicados", usada por Notas, Frequência, Progressão e Encontros
 * administrativos: a consulta só roda depois de "Aplicar filtros",
 * nunca ao digitar/selecionar. Não decide QUANDO um conjunto de
 * filtros é válido o bastante pra liberar o botão -- isso é regra de
 * cada página (curso/turma/busca mínima variam por tela), então essa
 * validação continua vivendo no componente que usa o hook, não aqui.
 *
 * applied === null é o estado idle (nunca aplicado / limpo) --
 * distinto de "aplicado com resultado vazio".
 */
export function useAppliedFilters(initialDraft) {
  const [draft, setDraft] = useState(initialDraft);
  const [applied, setApplied] = useState(null);
  const [page, setPage] = useState(1);

  const updateDraft = useCallback((patch) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const apply = useCallback(() => {
    setApplied(draft);
    setPage(1);
  }, [draft]);

  const clear = useCallback(() => {
    setDraft(initialDraft);
    setApplied(null);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isStale = applied !== null && JSON.stringify(draft) !== JSON.stringify(applied);

  return {
    draft,
    updateDraft,
    applied,
    hasApplied: applied !== null,
    isStale,
    apply,
    clear,
    page,
    setPage,
  };
}
