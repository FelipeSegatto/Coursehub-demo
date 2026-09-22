import {
  useEffect,
  useState,
} from "react";

import FinancialModal from "./FinancialModal";

import {
  changeInvoiceDueDate,
} from "../../services/FinancialService";

function getCurrentDueDate(invoice) {
  const value =
    invoice?.dueDate ??
    invoice?.due_date ??
    "";

  if (!value) {
    return "";
  }

  return String(value).split("T")[0];
}

export default function ChangeInvoiceDueDateModal({
  open,
  invoice,
  onClose,
  onSuccess,
}) {
  const [dueDate, setDueDate] =
    useState("");

  const [reason, setReason] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  useEffect(() => {
    console.log(
      "[ChangeInvoiceDueDateModal] props:",
      {
        open,
        invoiceId: invoice?.id,
      }
    );

    if (!open) {
      return;
    }

    setDueDate(
      getCurrentDueDate(invoice)
    );

    setReason("");
    setError("");
  }, [open, invoice]);

  async function handleSubmit(event) {
    event.preventDefault();

    const invoiceId = Number(
      invoice?.id
    );

    if (
      !Number.isInteger(invoiceId) ||
      invoiceId <= 0
    ) {
      setError(
        "O identificador da fatura é inválido."
      );

      return;
    }

    if (!dueDate) {
      setError(
        "Informe a nova data de vencimento."
      );

      return;
    }

    if (!reason.trim()) {
      setError(
        "Informe o motivo da alteração."
      );

      return;
    }

    try {
      setLoading(true);
      setError("");

      console.log(
        "[ChangeInvoiceDueDateModal] enviando:",
        {
          invoiceId,
          dueDate,
          reason: reason.trim(),
        }
      );

      await changeInvoiceDueDate(
        invoiceId,
        {
          dueDate,
          reason: reason.trim(),
        }
      );

      onClose();

      await onSuccess?.();
    } catch (requestError) {
      console.error(
        "[ChangeInvoiceDueDateModal] erro:",
        requestError
      );

      setError(
        requestError?.message ||
          "Não foi possível alterar o vencimento."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <FinancialModal
      open={open}
      title="Alterar vencimento"
      description="Escolha a nova data de vencimento da fatura e registre o motivo da alteração."
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel="Salvar alteração"
      submitDisabled={
        !dueDate ||
        !reason.trim()
      }
      loading={loading}
    >
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <div>
        <label
          htmlFor="invoice-due-date"
          className="block text-sm font-semibold text-slate-700"
        >
          Nova data de vencimento
        </label>

        <input
          id="invoice-due-date"
          type="date"
          value={dueDate}
          onChange={(event) =>
            setDueDate(
              event.target.value
            )
          }
          disabled={loading}
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
        />
      </div>

      <div>
        <label
          htmlFor="invoice-due-date-reason"
          className="block text-sm font-semibold text-slate-700"
        >
          Motivo da alteração
        </label>

        <textarea
          id="invoice-due-date-reason"
          rows={4}
          value={reason}
          onChange={(event) =>
            setReason(
              event.target.value
            )
          }
          disabled={loading}
          placeholder="Ex.: vencimento renegociado com o aluno."
          className="mt-2 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
        />
      </div>
    </FinancialModal>
  );
}