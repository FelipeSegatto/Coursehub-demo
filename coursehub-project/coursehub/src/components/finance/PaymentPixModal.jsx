import { useEffect, useState } from "react";
import { X, Copy, Check, Clock3, CheckCircle2, XCircle } from "lucide-react";

import {
  createInvoicePayment,
  getInvoicePayment,
  simulateInvoicePaymentApproval,
} from "../../services/FinancialService";
import { DEMO_POLL_INTERVAL_MS, usePaymentPolling } from "../../hooks/usePaymentPolling";
import { formatCurrency } from "./financeUtils";

const STATUS_LABEL = {
  pending: "Aguardando pagamento",
  approved: "Pagamento aprovado",
  rejected: "Pagamento não aprovado",
  cancelled: "Cobrança expirada",
  refunded: "Pagamento reembolsado",
  chargeback: "Pagamento contestado",
  expired: "Tentativa expirada",
};

/**
 * Fluxo de checkout PIX (seção 47 do rollout do gateway de
 * pagamentos): abre já criando (ou reaproveitando) a tentativa de
 * pagamento, depois mostra o QR Code / código copia-e-cola e faz
 * polling aguardando aprovação. O webhook é a fonte real da verdade
 * para quando a fatura de fato se torna "paga" -- o polling deste
 * modal é uma conveniência de UX para o aluno ver isso acontecer sem
 * atualizar a página, nunca o contrário (a aprovação nunca é
 * inferida no lado do cliente).
 */
export default function PaymentPixModal({ invoice, onClose, onApproved }) {
  const [creating, setCreating] = useState(true);
  const [createError, setCreateError] = useState("");
  const [createdPayment, setCreatedPayment] = useState(null);
  const [copied, setCopied] = useState(false);
  const [confirmingDemoPayment, setConfirmingDemoPayment] = useState(false);
  const [confirmDemoError, setConfirmDemoError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function create() {
      try {
        setCreating(true);
        setCreateError("");

        const result = await createInvoicePayment(invoice.id, "pix");

        if (cancelled) return;

        setCreatedPayment(result.data);
      } catch (requestError) {
        if (cancelled) return;

        setCreateError(requestError.message || "Não foi possível criar o pagamento.");
      } finally {
        if (!cancelled) setCreating(false);
      }
    }

    create();

    return () => {
      cancelled = true;
    };
  }, [invoice.id]);

  const { payment: polledPayment, error: pollError } = usePaymentPolling(
    createdPayment?.paymentId,
    getInvoicePayment,
    DEMO_POLL_INTERVAL_MS
  );
  const payment = createdPayment?.status === "approved" ? createdPayment : (polledPayment || createdPayment);
  const status = payment?.status;

  useEffect(() => {
    if (status === "approved") {
      onApproved?.();
    }
  }, [status, onApproved]);


  async function handleConfirmDemoPayment() {
    if (!payment?.paymentId || confirmingDemoPayment) return;

    try {
      setConfirmingDemoPayment(true);
      setConfirmDemoError("");
      const result = await simulateInvoicePaymentApproval(payment.paymentId);
      setCreatedPayment(result.data);
      if (result.data?.status === "approved") onApproved?.();
    } catch (requestError) {
      setConfirmDemoError(requestError.message || "Não foi possível confirmar o pagamento da demonstração.");
    } finally {
      setConfirmingDemoPayment(false);
    }
  }

  async function handleCopy() {
    if (!payment?.pixCopyPaste) return;

    try {
      await navigator.clipboard.writeText(payment.pixCopyPaste);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // A Clipboard API pode falhar silenciosamente (permissões,
      // contexto inseguro) -- o código continua visível na tela para
      // cópia manual de qualquer forma, então isso não é uma falha
      // grave.
    }
  }

  const isTerminalFailure = status === "rejected" || status === "cancelled" || status === "expired";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Pagar com Pix</h2>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <p className="mb-4 text-sm text-slate-500">
          {invoice.description} ·{" "}
          <span className="font-semibold text-slate-700">{formatCurrency(invoice.amount)}</span>
        </p>

        {creating && <p className="py-8 text-center text-sm text-slate-500">Gerando cobrança Pix...</p>}

        {!creating && createError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{createError}</div>
        )}

        {!creating && !createError && payment && (
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

                {payment.simulationAvailable && (
                  <button
                    type="button"
                    onClick={handleConfirmDemoPayment}
                    disabled={confirmingDemoPayment}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <CheckCircle2 size={17} />
                    {confirmingDemoPayment ? "Confirmando..." : "Confirmar pagamento da demo"}
                  </button>
                )}

                {confirmDemoError && (
                  <p className="text-center text-xs text-red-600">{confirmDemoError}</p>
                )}

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
                {status === "cancelled" || status === "expired"
                  ? "Esta tentativa de pagamento expirou. Feche esta janela e clique em pagar novamente para gerar uma nova."
                  : "O pagamento não foi aprovado. Você pode fechar esta janela e tentar novamente."}
              </p>
            )}

            {pollError && <p className="text-center text-xs text-red-600">{pollError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
