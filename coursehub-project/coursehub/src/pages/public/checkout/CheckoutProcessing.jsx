import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { usePaymentPolling } from "../../../hooks/usePaymentPolling";
import { getInvoicePayment } from "../../../services/FinancialService";
import { getPublicInvoicePayment } from "../../../services/PublicInvoicePaymentService";

const FETCH_BY_CHANNEL = {
  student: getInvoicePayment,
  public: getPublicInvoicePayment,
  invoice: getPublicInvoicePayment,
};

const TERMINAL_STATUSES = new Set(["approved", "rejected", "cancelled", "refunded", "chargeback"]);

/**
 * /checkout/processando -- tela intermediária de acompanhamento,
 * usada pelos 3 canais (aluno autenticado, checkout público, link
 * privado de invoice). `via` decide qual endpoint de leitura usar
 * para o polling (usePaymentPolling generalizado). Nenhum id sensível
 * além dos já necessários (paymentId/invoiceId, ambos numéricos
 * simples, sem CPF/e-mail) aparece na URL.
 */
export default function CheckoutProcessing() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const paymentId = searchParams.get("paymentId");
  const invoiceId = searchParams.get("invoiceId");
  const via = searchParams.get("via") || "public";

  const fetchFn = FETCH_BY_CHANNEL[via] || getPublicInvoicePayment;
  const { payment, error } = usePaymentPolling(paymentId, fetchFn);

  useEffect(() => {
    if (payment?.status && TERMINAL_STATUSES.has(payment.status)) {
      navigate(`/checkout/resultado?invoiceId=${invoiceId}&status=${payment.status}&via=${via}`, {
        replace: true,
      });
    }
  }, [payment?.status, invoiceId, via, navigate]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center sm:px-6">
      <Loader2 size={36} className="animate-spin text-blue-600" aria-hidden="true" />

      <h1 className="mt-6 text-xl font-bold text-gray-900">Estamos aguardando a confirmação do pagamento</h1>

      <p className="mt-2 text-sm text-gray-500">
        {payment?.status === "pending"
          ? "Isso pode levar alguns instantes. Não feche esta página."
          : "Carregando status do pagamento..."}
      </p>

      {error && <p className="mt-4 text-xs text-red-600">{error}</p>}
    </div>
  );
}
