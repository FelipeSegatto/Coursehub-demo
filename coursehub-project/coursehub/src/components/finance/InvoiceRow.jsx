import { useState } from "react";

import {
  formatCurrency,
  formatDate,
  getInvoiceStatusLabel,
  getPaymentMethodLabel,
} from "./financeUtils";
import PaymentPixModal from "./PaymentPixModal";
import DocumentDownloadButton from "../documents/DocumentDownloadButton";
import { getStudentInvoiceCopyEndpoints } from "../../services/DocumentGenerationService";

export default function InvoiceRow({
  invoice,
  payment,
  billingType,
  onPaymentApproved,
}) {
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const canPay = ["pending", "processing", "overdue"].includes(invoice.status);
  const dueDate =
    invoice.dueDate ??
    invoice.due_date;

  const installmentNumber =
    invoice.installmentNumber ??
    invoice.installment_number;

  const totalInstallments =
    invoice.totalInstallments ??
    invoice.total_installments ??
    invoice.installmentCount ??
    invoice.installment_count;

  const paymentMethod =
    payment?.paymentMethod ??
    payment?.payment_method ??
    payment?.method;

  const cardInstallments =
    payment?.cardInstallments ??
    payment?.card_installments;

  const isMonthlyPlan =
    billingType === "monthly_plan";

  const isCreditCard =
    paymentMethod === "credit_card";

  const paymentMethodText = paymentMethod
    ? `${getPaymentMethodLabel(paymentMethod)}${
        isCreditCard && Number(cardInstallments) > 1
          ? ` · ${cardInstallments}x no cartão`
          : ""
      }`
    : null;

  const statusStyles = {
    paid: "bg-emerald-50 text-emerald-700",
    pending: "bg-amber-50 text-amber-700",
    processing: "bg-blue-50 text-blue-700",
    overdue: "bg-red-50 text-red-700",
    cancelled: "bg-slate-100 text-slate-600",
  };

  return (
    <div className="grid gap-4 border-b border-slate-100 px-5 py-4 last:border-b-0 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-center">
      <div>
        <p className="text-sm font-medium text-slate-900">
          {isMonthlyPlan
            ? `Mensalidade ${installmentNumber || ""}${
                totalInstallments
                  ? ` de ${totalInstallments}`
                  : ""
              }`
            : "Pagamento único"}
        </p>

        <p className="mt-1 text-xs text-slate-500">
          Cobrança #{invoice.id}
        </p>

        {!isMonthlyPlan && paymentMethodText && (
          <p className="mt-1 text-xs font-medium text-slate-600">
            {paymentMethodText}
          </p>
        )}
      </div>

      <div>
        <p className="text-xs text-slate-400">
          Vencimento
        </p>

        <p className="mt-1 text-sm font-medium text-slate-700">
          {formatDate(dueDate)}
        </p>
      </div>

      <div>
        <p className="text-xs text-slate-400">
          Valor
        </p>

        <p className="mt-1 text-sm font-semibold text-slate-900">
          {formatCurrency(invoice.amount)}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 md:justify-end">
        <span
          className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ${
            statusStyles[invoice.status] ||
            "bg-slate-100 text-slate-600"
          }`}
        >
          {getInvoiceStatusLabel(invoice.status)}
        </span>

        <DocumentDownloadButton
          endpoints={getStudentInvoiceCopyEndpoints(invoice.id)}
          label="2ª via"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        />

        {canPay && (
          <button
            type="button"
            onClick={() => setShowPaymentModal(true)}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
          >
            Pagar
          </button>
        )}
      </div>

      {showPaymentModal && (
        <PaymentPixModal
          invoice={invoice}
          onClose={() => setShowPaymentModal(false)}
          onApproved={onPaymentApproved}
        />
      )}
    </div>
  );
}