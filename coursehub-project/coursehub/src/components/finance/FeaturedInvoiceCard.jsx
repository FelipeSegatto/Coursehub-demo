import { useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  ChevronRight,
  Clock3,
} from "lucide-react";

import {
  formatCurrency,
  formatDate,
  getInvoiceStatusLabel,
} from "./financeUtils";
import PaymentPixModal from "./PaymentPixModal";

export default function FeaturedInvoiceCard({ invoice, onPaymentApproved }) {
  const [payingInvoice, setPayingInvoice] = useState(null);

  if (!invoice) {
    return null;
  }

  const isOverdue = invoice.status === "overdue";
  const canPay = ["pending", "processing", "overdue"].includes(invoice.status);

  const courseName =
    invoice.courseName ||
    invoice.course_name ||
    invoice.title ||
    "Curso";

  const dueDate =
    invoice.dueDate ||
    invoice.due_date;

  const installmentNumber =
    invoice.installmentNumber ||
    invoice.installment_number;

  const totalInstallments =
    invoice.totalInstallments ||
    invoice.total_installments;

  return (
    <section
      className={`rounded-2xl border p-6 ${
        isOverdue
          ? "border-red-200 bg-red-50"
          : "border-blue-200 bg-blue-50"
      }`}
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-4">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
              isOverdue
                ? "bg-red-100 text-red-700"
                : "bg-blue-100 text-blue-700"
            }`}
          >
            {isOverdue ? (
              <AlertCircle size={23} />
            ) : (
              <Clock3 size={23} />
            )}
          </div>

          <div>
            <p
              className={`text-sm font-semibold ${
                isOverdue
                  ? "text-red-700"
                  : "text-blue-700"
              }`}
            >
              {isOverdue
                ? "Cobrança em atraso"
                : "Próxima cobrança"}
            </p>

            <h2 className="mt-1 text-xl font-semibold text-slate-900">
              {courseName}
            </h2>

            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
              <span className="flex items-center gap-2">
                <CalendarDays size={16} />

                Vencimento: {formatDate(dueDate)}
              </span>

              {installmentNumber && (
                <span>
                  Parcela {installmentNumber}
                  {totalInstallments
                    ? ` de ${totalInstallments}`
                    : ""}
                </span>
              )}

              <span>
                {getInvoiceStatusLabel(invoice.status)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-5 lg:block lg:text-right">
          <div>
            <p className="text-sm text-slate-500">
              Valor
            </p>

            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {formatCurrency(invoice.amount)}
            </p>
          </div>

          <button
            type="button"
            onClick={() => canPay && setPayingInvoice(invoice)}
            disabled={!canPay}
            className={`
              inline-flex items-center gap-2 rounded-xl px-4 py-2.5
              text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60
              ${
                isOverdue
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }
            `}
          >
            Pagar com Pix
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      {payingInvoice && (
        <PaymentPixModal
          invoice={payingInvoice}
          onClose={() => setPayingInvoice(null)}
          onApproved={onPaymentApproved}
        />
      )}
    </section>
  );
}