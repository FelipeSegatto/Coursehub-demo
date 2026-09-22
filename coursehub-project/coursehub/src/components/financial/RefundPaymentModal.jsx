import { useEffect, useState } from "react";

import { refundPayment } from "../../services/FinancialService";

import FinancialModal from "./FinancialModal";

function getPaymentAmount(payment) {
  return Number(
    payment?.amount ??
      payment?.paidAmount ??
      payment?.paid_amount ??
      0
  );
}

export default function RefundPaymentModal({
  open,
  payment,
  onClose,
  onSuccess,
}) {
  const paymentAmount =
    getPaymentAmount(payment);

  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] =
    useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setAmount(
      paymentAmount > 0
        ? String(paymentAmount)
        : ""
    );

    setReason("");
    setError("");
  }, [open, paymentAmount]);

  async function handleSubmit(event) {
    event.preventDefault();

    const numericAmount = Number(amount);

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      setError(
        "Informe um valor de reembolso válido."
      );
      return;
    }

    if (numericAmount > paymentAmount) {
      setError(
        "O valor não pode superar o pagamento original."
      );
      return;
    }

    if (reason.trim().length < 3) {
      setError(
        "Informe o motivo do reembolso."
      );
      return;
    }

    try {
      setLoading(true);
      setError("");

      await refundPayment(payment.id, {
        amount: numericAmount,
        reason: reason.trim(),
      });

      await onSuccess?.();
      onClose();
    } catch (requestError) {
      setError(
        requestError?.message ||
          "Não foi possível reembolsar o pagamento."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <FinancialModal
      open={open}
      title="Reembolsar pagamento"
      description={`Registre o reembolso do pagamento #${payment?.id ?? ""}.`}
      submitLabel="Confirmar reembolso"
      danger
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
          htmlFor="refund-payment-amount"
          className="mb-1.5 block text-sm font-semibold text-slate-700"
        >
          Valor do reembolso
        </label>

        <input
          id="refund-payment-amount"
          type="number"
          min="0.01"
          max={paymentAmount}
          step="0.01"
          value={amount}
          onChange={(event) =>
            setAmount(event.target.value)
          }
          disabled={loading}
          className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
        />
      </div>

      <div>
        <label
          htmlFor="refund-payment-reason"
          className="mb-1.5 block text-sm font-semibold text-slate-700"
        >
          Motivo
        </label>

        <textarea
          id="refund-payment-reason"
          rows={4}
          maxLength={500}
          value={reason}
          onChange={(event) =>
            setReason(event.target.value)
          }
          disabled={loading}
          className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
        />
      </div>
    </FinancialModal>
  );
}