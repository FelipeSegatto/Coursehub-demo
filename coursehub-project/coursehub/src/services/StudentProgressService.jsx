import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { apiFetch } from "./APIService";

/**
 * Hook responsável por carregar a visão geral
 * de progresso do aluno.
 *
 * O cálculo dos percentuais NÃO acontece aqui.
 * O backend é a fonte da verdade.
 */
export default function useStudentProgress(
  userId
) {
  const [overview, setOverview] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState(null);

  /**
   * Busca os dados atualizados de progresso.
   */
  const fetchProgress = useCallback(
    async () => {
      if (!userId) {
        setOverview(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const data = await apiFetch(
          `/api/students/by-user/${userId}/progress-overview`
        );

        setOverview(data);
      } catch (requestError) {
        console.error(
          "Erro ao carregar progresso do aluno:",
          requestError
        );

        setError(
          requestError.message ||
            "Não foi possível carregar o progresso."
        );

        setOverview(null);
      } finally {
        setLoading(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  return {
    overview,
    loading,
    error,
    refresh: fetchProgress,
  };
}