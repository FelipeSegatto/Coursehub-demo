import {
  formatCurrency,
  formatDate,
  getPaymentMethodLabel,
  getPaymentStatusLabel,
} from "./financeUtils";
import DocumentDownloadButton from "../documents/DocumentDownloadButton";
import { getStudentPaymentReceiptEndpoints } from "../../services/DocumentGenerationService";

export default function PaymentRow({ payment }) {
  const paymentDate =
    payment.paidAt ??
    payment.paid_at ??
    payment.paymentDate ??
    payment.payment_date ??
    payment.createdAt ??
    payment.created_at;

  const paymentMethod =
    payment.paymentMethod ??
    payment.payment_method ??
    payment.method;

  const cardInstallments =
    payment.cardInstallments ??
    payment.card_installments;

  const isCreditCard =
    paymentMethod === "credit_card";

  const paymentMethodText =
    `${getPaymentMethodLabel(paymentMethod)}${
      isCreditCard && Number(cardInstallments) > 1
        ? ` · ${cardInstallments}x`
        : ""
    }`;

  const statusStyles = {
    created: "bg-slate-100 text-slate-700",
    pending: "bg-amber-50 text-amber-700",
    approved: "bg-emerald-50 text-emerald-700",
    rejected: "bg-red-50 text-red-700",
    cancelled: "bg-slate-100 text-slate-600",
    refunded: "bg-purple-50 text-purple-700",
    chargeback: "bg-red-50 text-red-700",
    expired: "bg-orange-50 text-orange-700",
  };

  return (
    <div className="grid gap-4 border-b border-slate-100 px-5 py-4 last:border-b-0 md:grid-cols-[1fr_1fr_1fr_auto] md:items-center">
      <div>
        <p className="text-sm font-medium text-slate-900">
          Pagamento #{payment.id}
        </p>

        <p className="mt-1 text-sm font-medium text-slate-700">
            {paymentMethodText}
        </p>
      </div>

      <div>
        <p className="text-xs text-slate-400">
          Data
        </p>

        <p className="mt-1 text-sm font-medium text-slate-700">
          {formatDate(paymentDate)}
        </p>
      </div>

      <div>
        <p className="text-xs text-slate-400">
          Valor
        </p>

        <p className="mt-1 text-sm font-semibold text-slate-900">
          {formatCurrency(payment.amount)}
        </p>
      </div>

      <div className="flex items-center justify-end gap-3">
        <span
          className={`w-fit rounded-full px-2.5 py-1 text-xs font-medium ${
            statusStyles[payment.status] ||
            "bg-slate-100 text-slate-600"
          }`}
        >
          {getPaymentStatusLabel(payment.status)}
        </span>

        {payment.status === "approved" && (
          <DocumentDownloadButton
            endpoints={getStudentPaymentReceiptEndpoints(payment.id)}
            label="recibo"
            className="text-xs font-semibold text-blue-600 hover:underline"
          />
        )}
      </div>
    </div>
  );
}