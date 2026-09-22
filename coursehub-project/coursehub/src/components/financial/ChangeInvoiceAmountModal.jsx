import { useEffect, useState } from "react";

import { changeInvoiceAmount } from "../../services/FinancialService";

import FinancialModal from "./FinancialModal";

function getCurrentAmount(invoice) {
  return (
    invoice?.amount ??
    invoice?.totalAmount ??
    invoice?.total_amount ??
    ""
  );
}

export default function ChangeInvoiceAmountModal({
  open,
  invoice,
  onClose,
  onSuccess,
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setAmount(String(getCurrentAmount(invoice)));
    setReason("");
    setError("");
  }, [open, invoice]);

  async function handleSubmit(event) {
  event.preventDefault();

  const invoiceId = Number(invoice?.id);

  const normalizedAmount = Number(
    String(amount).replace(",", ".")
  );

  if (
    !Number.isFinite(normalizedAmount) ||
    normalizedAmount <= 0
  ) {
    setError(
      "O valor da fatura precisa ser maior que zero."
    );
    return;
  }

  try {
    setLoading(true);
    setError("");

    const payload = {
        newAmount: normalizedAmount,
        reason: reason.trim(),
        };

        console.log(
        "[ChangeInvoiceAmountModal] payload:",
        payload
        );

    await changeInvoiceAmount(
        invoiceId,
        payload
        );

   
    onClose();
    await onSuccess?.();
  } catch (requestError) {
    console.error(
      "[ChangeInvoiceAmountModal] erro:",
      requestError
    );

    setError(
      requestError?.message ||
        "Não foi possível alterar o valor da fatura."
    );
  } finally {
    setLoading(false);
  }
}

  return (
    <FinancialModal
      open={open}
      title="Alterar valor da fatura"
      description={`Atualize o valor da fatura #${invoice?.id ?? ""}.`}
      submitLabel="Alterar valor"
      loading={loading}
      submitDisabled={!amount || !reason.trim()}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div>
        <label
          htmlFor="new-invoice-amount"
          className="mb-1.5 block text-sm font-semibold text-slate-700"
        >
          Novo valor
        </label>

        <div className="flex min-h-11 overflow-hidden rounded-lg border border-slate-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
          <span className="flex items-center border-r border-slate-300 bg-slate-50 px-3 text-sm text-slate-500">
            R$
          </span>

          <input
            id="new-invoice-amount"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(event) =>
              setAmount(event.target.value)
            }
            disabled={loading}
            className="w-full px-3 text-sm outline-none"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="amount-change-reason"
          className="mb-1.5 block text-sm font-semibold text-slate-700"
        >
          Motivo
        </label>

        <textarea
          id="amount-change-reason"
          value={reason}
          onChange={(event) =>
            setReason(event.target.value)
          }
          disabled={loading}
          rows={4}
          maxLength={500}
          placeholder="Informe o motivo da alteração do valor."
          className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />

        <p className="mt-1 text-right text-xs text-slate-400">
          {reason.length}/500
        </p>
      </div>
    </FinancialModal>
  );
}