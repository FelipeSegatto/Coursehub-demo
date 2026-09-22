import { useEffect, useRef, useState } from "react";
import { getInvoicePayment } from "../services/FinancialService";

const POLL_INTERVAL_MS = 4000;
export const DEMO_POLL_INTERVAL_MS = 1000;
// ~5 minutos de polling -- generoso para um QR Code PIX (geralmente
// pago em segundos a poucos minutos), limitado para que uma aba
// esquecida aberta não fique consultando para sempre. O webhook
// continua sendo a fonte real da verdade; isto é só UX, uma leitura
// de fallback enquanto o modal está aberto.
const MAX_POLLS = 75;

const TERMINAL_STATUSES = new Set(["approved", "rejected", "cancelled", "refunded", "chargeback"]);

/**
 * Consulta o pagamento enquanto o status ainda é "pending", para que a
 * UI reflita uma aprovação sem o usuário precisar atualizar a página.
 * Para automaticamente ao atingir um status terminal, ao atingir
 * MAX_POLLS, ou ao desmontar. `fetchFn` por padrão é a leitura
 * autenticada do aluno (GET /student/finance/payments/:id) -- outros
 * canais (link privado de invoice, checkout público) passam uma
 * função equivalente para o próprio endpoint público/de sessão deles,
 * mantendo exatamente o mesmo comportamento de polling.
 */
export function usePaymentPolling(
  paymentId,
  fetchFn = getInvoicePayment,
  pollIntervalMs = POLL_INTERVAL_MS
) {
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState("");
  const pollCountRef = useRef(0);

  useEffect(() => {
    if (!paymentId) {
      return undefined;
    }

    let cancelled = false;
    let timeoutId = null;
    pollCountRef.current = 0;

    async function poll() {
      try {
        const result = await fetchFn(paymentId);

        if (cancelled) return;

        setPayment(result.data);
        setError("");

        pollCountRef.current += 1;

        const isTerminal = TERMINAL_STATUSES.has(result.data.status);

        if (!isTerminal && pollCountRef.current < MAX_POLLS) {
          timeoutId = setTimeout(poll, pollIntervalMs);
        }
      } catch (requestError) {
        if (cancelled) return;

        setError(requestError.message || "Não foi possível consultar o status do pagamento.");

        pollCountRef.current += 1;

        if (pollCountRef.current < MAX_POLLS) {
          timeoutId = setTimeout(poll, pollIntervalMs);
        }
      }
    }

    poll();

    return () => {
      cancelled = true;

      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [paymentId, fetchFn, pollIntervalMs]);

  return { payment, error };
}
