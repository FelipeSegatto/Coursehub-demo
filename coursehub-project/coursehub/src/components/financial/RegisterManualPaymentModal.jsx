import { useEffect, useMemo, useState } from "react";

import { registerManualPayment } from "../../services/FinancialService";
import { PAYMENT_METHOD_LABELS } from "./paymentLabels";

import FinancialModal from "./FinancialModal";

/**
 * O modelo atual não tem pagamento parcial -- o backend
 * (paymentService.js#registerManualPayment) exige que o valor
 * registrado seja exatamente igual a invoices.amount, sem exceção.
 * Por isso o valor aqui nunca é digitado pelo admin: vem sempre da
 * própria invoice, para não dar a impressão de que um valor arbitrário
 * seria aceito.
 */
function getInvoiceAmount(invoice) {
  return Number(
    invoice?.amount ??
      invoice?.totalAmount ??
      invoice?.total_amount ??
      0
  );
}

function getToday() {
  return new Date().toISOString().split("T")[0];
}

export default function RegisterManualPaymentModal({
  open,
  invoice,
  onClose,
  onSuccess,
}) {
  const invoiceAmount = useMemo(
    () => getInvoiceAmount(invoice),
    [invoice]
  );

  const [paymentDate, setPaymentDate] =
    useState("");
  const [paymentMethod, setPaymentMethod] =
    useState("pix");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] =
    useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setPaymentDate(getToday());
    setPaymentMethod("pix");
    setReason("");
    setError("");
  }, [open, invoice]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (
      !Number.isFinite(invoiceAmount) ||
      invoiceAmount <= 0
    ) {
      setError(
        "Não foi possível determinar o valor integral desta fatura."
      );
      return;
    }

    if (!paymentDate) {
      setError("Informe a data do pagamento.");
      return;
    }

    if (!reason.trim()) {
      setError(
        "Informe o motivo/observações do registro manual."
      );
      return;
    }

    try {
      setLoading(true);
      setError("");

      await registerManualPayment(
        invoice.id,
        {
          amount: invoiceAmount,
          paymentDate,
          paymentMethod,
          reason: reason.trim(),
        }
      );

      await onSuccess?.();
      onClose();
    } catch (requestError) {
      setError(
        requestError?.message ||
          "Não foi possível registrar o pagamento."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <FinancialModal
      open={open}
      title="Registrar pagamento manual"
      description={`Registre um pagamento recebido para a fatura #${invoice?.id ?? ""}.`}
      submitLabel="Registrar pagamento"
      loading={loading}
      submitDisabled={
        !invoiceAmount ||
        !paymentDate ||
        !paymentMethod ||
        !reason.trim()
      }
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
          Valor integral da fatura
        </p>

        <p className="mt-1 text-lg font-semibold text-blue-900">
          {new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
          }).format(invoiceAmount)}
        </p>

        <p className="mt-1 text-xs text-blue-700">
          O registro manual não aceita pagamento parcial -- o valor é sempre o da fatura inteira.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="manual-payment-amount"
            className="mb-1.5 block text-sm font-semibold text-slate-700"
          >
            Valor recebido (integral, não editável)
          </label>

          <input
            id="manual-payment-amount"
            type="number"
            step="0.01"
            value={invoiceAmount}
            readOnly
            disabled={loading}
            className="min-h-11 w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-100 px-3 text-sm text-slate-500 focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="manual-payment-date"
            className="mb-1.5 block text-sm font-semibold text-slate-700"
          >
            Data do pagamento
          </label>

          <input
            id="manual-payment-date"
            type="date"
            value={paymentDate}
            onChange={(event) =>
              setPaymentDate(event.target.value)
            }
            disabled={loading}
            className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="manual-payment-method"
          className="mb-1.5 block text-sm font-semibold text-slate-700"
        >
          Forma de pagamento
        </label>

        <select
          id="manual-payment-method"
          value={paymentMethod}
          onChange={(event) =>
            setPaymentMethod(event.target.value)
          }
          disabled={loading}
          className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          {Object.entries(PAYMENT_METHOD_LABELS).map(
            ([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            )
          )}
        </select>
      </div>

      <div>
        <label
          htmlFor="manual-payment-reason"
          className="mb-1.5 block text-sm font-semibold text-slate-700"
        >
          Motivo / observações
        </label>

        <textarea
          id="manual-payment-reason"
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(event) =>
            setReason(event.target.value)
          }
          disabled={loading}
          placeholder="Ex.: comprovante recebido por e-mail, transferência confirmada no extrato do dia..."
          className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />

        <p className="mt-1 text-right text-xs text-slate-400">
          {reason.length}/500
        </p>
      </div>
    </FinancialModal>
  );
}