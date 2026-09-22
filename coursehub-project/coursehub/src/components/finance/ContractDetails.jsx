import {
  CalendarDays,
  CreditCard,
  FileText,
} from "lucide-react";

import {
  formatCurrency,
  formatDate,
  getContractStatusLabel,
  getPaymentMethodLabel,
} from "./financeUtils";

function DetailItem({ icon, label, value }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 text-slate-400">
        {icon}
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {label}
        </p>

        <p className="mt-1 text-sm font-medium text-slate-800">
          {value}
        </p>
      </div>
    </div>
  );
}

export default function ContractDetails({ contract, payment }) {
  if (!contract) {
    return null;
  }

  const totalAmount =
    contract.totalAmount ||
    contract.total_amount ||
    contract.contractValue ||
    contract.contract_value;

  const startDate =
    contract.startDate ||
    contract.start_date ||
    contract.createdAt ||
    contract.created_at;

  const endDate =
    contract.endDate ||
    contract.end_date;

 const paymentMethod =
  payment?.paymentMethod ??
  payment?.payment_method ??
  payment?.method;

 const cardInstallments =
  payment?.cardInstallments ??
  payment?.card_installments;

 const paymentMethodLabel = paymentMethod
   ? paymentMethod === "credit_card" &&
     Number(cardInstallments) > 1
    ? `${getPaymentMethodLabel(paymentMethod)} · ${cardInstallments}x`
    : getPaymentMethodLabel(paymentMethod)
  : "Ainda não definida";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">
          Detalhes do contrato
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Informações da contratação deste curso.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <DetailItem
          icon={<FileText size={18} />}
          label="Valor total"
          value={formatCurrency(totalAmount)}
        />

        <DetailItem
            icon={<CreditCard size={18} />}
            label="Formas aceitas"
            value={[
                contract.acceptsPix && "Pix",
                contract.acceptsBoleto && "Boleto",
                contract.acceptsCreditCard && "Cartão",
            ]
                .filter(Boolean)
                .join(", ")}
        />

        <DetailItem
          icon={<CreditCard size={18} />}
          label="Forma de pagamento"
          value={getPaymentMethodLabel(paymentMethodLabel)}
        />

        <DetailItem
          icon={<CalendarDays size={18} />}
          label="Status"
          value={getContractStatusLabel(contract.status)}
        />
      </div>

      {(startDate || endDate) && (
        <div className="mt-6 border-t border-slate-100 pt-5 text-sm text-slate-500">
          {startDate && (
            <span>
              Início: {formatDate(startDate)}
            </span>
          )}

          {startDate && endDate && (
            <span className="mx-3 text-slate-300">•</span>
          )}

          {endDate && (
            <span>
              Término: {formatDate(endDate)}
            </span>
          )}
        </div>
      )}
    </section>
  );
}