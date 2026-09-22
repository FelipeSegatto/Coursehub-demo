import { useEffect, useState } from "react";
import { Copy, Check, Clock3, CheckCircle2, XCircle } from "lucide-react";

import { usePaymentPolling } from "../../hooks/usePaymentPolling";

const STATUS_LABEL = {
  pending: "Aguardando pagamento",
  approved: "Pagamento aprovado",
  rejected: "Pagamento não aprovado",
  cancelled: "Cobrança expirada",
  refunded: "Pagamento reembolsado",
  chargeback: "Pagamento contestado",
};

/**
 * Painel de pagamento Pix reutilizável -- mesmo visual/comportamento
 * de PaymentPixModal.jsx (QR Code + copia-e-cola + polling), mas
 * desacoplado de "ser um modal do aluno autenticado" para poder ser
 * usado também no link privado de invoice e no checkout público.
 * `initialPayment` já vem com os dados do Pix (gerados na criação);
 * `fetchPaymentFn` é a função de leitura do canal certo (autenticada,
 * de sessão de invoice, ou de checkout público) usada para o polling.
 */
export default function PixPaymentPanel({ initialPayment, fetchPaymentFn, onApproved }) {
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
    if (!payment?.pixCopyPaste) return;

    try {
      await navigator.clipboard.writeText(payment.pixCopyPaste);
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

      {status === "pending" && payment.pixQrCode && (
        <div className="flex flex-col items-center gap-3">
          {payment.pixQrCode.startsWith("SIMULATED_PIX_QR") ? (
            <div className="flex h-40 w-40 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-center text-xs text-slate-400">
              QR Code simulado (ambiente de teste)
            </div>
          ) : (
            <img
              src={`data:image/png;base64,${payment.pixQrCode}`}
              alt="QR Code Pix"
              className="h-40 w-40 rounded-xl border border-slate-200"
            />
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Código copiado" : "Copiar código Pix"}
          </button>

          {payment.pixExpiresAt && (
            <p className="text-xs text-slate-400">
              Expira às{" "}
              {new Date(payment.pixExpiresAt).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
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
