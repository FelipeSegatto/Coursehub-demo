import { useEffect, useState } from "react";
import { Copy, Check, Clock3, CheckCircle2, XCircle, ExternalLink } from "lucide-react";

import { usePaymentPolling } from "../../hooks/usePaymentPolling";

const STATUS_LABEL = {
  pending: "Aguardando compensação do boleto",
  approved: "Pagamento aprovado",
  rejected: "Pagamento não aprovado",
  cancelled: "Cobrança expirada",
  refunded: "Pagamento reembolsado",
  chargeback: "Pagamento contestado",
};

/** Painel de boleto -- mesmo padrão visual/de polling do PixPaymentPanel. */
export default function BoletoPaymentPanel({ initialPayment, fetchPaymentFn, onApproved }) {
  const [copied, setCopied] = useState(false);
  const { payment: polledPayment, error: pollError } = usePaymentPolling(
    initialPayment?.paymentId,
    fetchPaymentFn
  );

  const payment = polledPayment || initialPayment;
  const status = payment?.status;
  const isTerminalFailure = status === "rejected" || status === "cancelled";

  useEffect(() => {
    if (status === "approved") {
      onApproved?.();
    }
  }, [status, onApproved]);

  async function handleCopy() {
    if (!payment?.boletoBarcode) return;

    try {
      await navigator.clipboard.writeText(payment.boletoBarcode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API pode falhar silenciosamente -- o código
      // continua visível na tela para cópia manual.
    }
  }

  if (!payment) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div
        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${
          status === "approved"
            ? "bg-emerald-50 text-emerald-700"
            : isTerminalFailure
            ? "bg-red-50 text-red-700"
            : "bg-amber-50 text-amber-700"
        }`}
      >
        {status === "approved" && <CheckCircle2 size={18} />}
        {isTerminalFailure && <XCircle size={18} />}
        {(!status || status === "pending") && <Clock3 size={18} />}
        {STATUS_LABEL[status] || "Aguardando pagamento"}
      </div>

      {status === "pending" && payment.boletoBarcode && (
        <div className="flex flex-col items-center gap-3">
          <p className="w-full break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-center font-mono text-xs text-slate-700">
            {payment.boletoBarcode}
          </p>

          <button
            type="button"
            onClick={handleCopy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Código copiado" : "Copiar linha digitável"}
          </button>

          {payment.boletoUrl && (
            <a
              href={payment.boletoUrl}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ExternalLink size={16} />
              Abrir boleto
            </a>
          )}

          {payment.boletoDueDate && (
            <p className="text-xs text-slate-400">
              Vencimento:{" "}
              {new Date(payment.boletoDueDate).toLocaleDateString("pt-BR")}
            </p>
          )}
        </div>
      )}

      {status === "approved" && (
        <p className="text-center text-sm text-slate-500">Recebemos a confirmação do pagamento. Obrigado!</p>
      )}

      {isTerminalFailure && (
        <p className="text-center text-sm text-slate-500">
          {status === "cancelled"
            ? "Esta cobrança expirou. Clique em pagar novamente para gerar uma nova."
            : "O pagamento não foi aprovado. Você pode tentar novamente."}
        </p>
      )}

      {pollError && <p className="text-center text-xs text-red-600">{pollError}</p>}
    </div>
  );
}
