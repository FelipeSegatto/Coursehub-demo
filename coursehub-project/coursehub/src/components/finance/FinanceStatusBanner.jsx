import {
  AlertTriangle,
  BadgeCheck,
  Clock3,
} from "lucide-react";

import { formatCurrency } from "./financeUtils";

export default function FinanceStatusBanner({
  invoices = [],
}) {
  const overdueInvoices = invoices.filter(
    (invoice) => invoice.status === "overdue"
  );

  const overdueAmount = overdueInvoices.reduce(
    (total, invoice) =>
      total + Number(invoice.amount || 0),
    0
  );

  const pendingInvoices = invoices.filter((invoice) =>
    ["pending", "processing"].includes(invoice.status)
  );

  if (overdueInvoices.length > 0) {
    return (
      <section className="flex gap-4 rounded-2xl border border-red-200 bg-red-50 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700">
          <AlertTriangle size={20} />
        </div>

        <div>
          <h2 className="font-semibold text-red-900">
            Existem cobranças em atraso
          </h2>

          <p className="mt-1 text-sm leading-6 text-red-700">
            Você possui {overdueInvoices.length}{" "}
            {overdueInvoices.length === 1
              ? "cobrança vencida"
              : "cobranças vencidas"}
            , totalizando {formatCurrency(overdueAmount)}.
          </p>
        </div>
      </section>
    );
  }

  if (pendingInvoices.length > 0) {
    return (
      <section className="flex gap-4 rounded-2xl border border-blue-200 bg-blue-50 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
          <Clock3 size={20} />
        </div>

        <div>
          <h2 className="font-semibold text-blue-900">
            Pagamentos em dia
          </h2>

          <p className="mt-1 text-sm leading-6 text-blue-700">
            Seu contrato está ativo e não possui cobranças vencidas.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
        <BadgeCheck size={20} />
      </div>

      <div>
        <h2 className="font-semibold text-emerald-900">
          Financeiro regularizado
        </h2>

        <p className="mt-1 text-sm leading-6 text-emerald-700">
          Não existem cobranças pendentes para este contrato.
        </p>
      </div>
    </section>
  );
}