import { useEffect, useState } from "react";

import { cancelInvoice } from "../../services/FinancialService";

import FinancialModal from "./FinancialModal";

export default function CancelInvoiceModal({
  open,
  invoice,
  onClose,
  onSuccess,
}) {
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] =
    useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] =
    useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setReason("");
    setConfirmation("");
    setError("");
  }, [open]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (reason.trim().length < 3) {
      setError(
        "Informe o motivo do cancelamento."
      );
      return;
    }

    if (
      confirmation.trim().toUpperCase() !==
      "CANCELAR"
    ) {
      setError(
        'Digite "CANCELAR" para confirmar.'
      );
      return;
    }

    try {
      setLoading(true);
      setError("");

      await cancelInvoice(invoice.id, {
        reason: reason.trim(),
      });

      await onSuccess?.();
      onClose();
    } catch (requestError) {
      setError(
        requestError?.message ||
          "Não foi possível cancelar a fatura."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <FinancialModal
      open={open}
      title="Cancelar fatura"
      description={`Esta ação cancelará a fatura #${invoice?.id ?? ""}.`}
      submitLabel="Cancelar fatura"
      loading={loading}
      danger
      submitDisabled={
        !reason.trim() ||
        confirmation.trim().toUpperCase() !==
          "CANCELAR"
      }
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-900">
          Atenção
        </p>

        <p className="mt-1 text-sm leading-6 text-amber-800">
          A fatura deixará de ser considerada nas
          cobranças pendentes. A operação ficará
          registrada no histórico financeiro.
        </p>
      </div>

      <div>
        <label
          htmlFor="invoice-cancellation-reason"
          className="mb-1.5 block text-sm font-semibold text-slate-700"
        >
          Motivo do cancelamento
        </label>

        <textarea
          id="invoice-cancellation-reason"
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

      <div>
        <label
          htmlFor="invoice-cancellation-confirmation"
          className="mb-1.5 block text-sm font-semibold text-slate-700"
        >
          Digite CANCELAR para confirmar
        </label>

        <input
          id="invoice-cancellation-confirmation"
          type="text"
          value={confirmation}
          onChange={(event) =>
            setConfirmation(event.target.value)
          }
          disabled={loading}
          autoComplete="off"
          className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm uppercase focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
        />
      </div>
    </FinancialModal>
  );
}