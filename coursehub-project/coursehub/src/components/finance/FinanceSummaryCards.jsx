import {
  CircleDollarSign,
  Clock3,
  ReceiptText,
  TriangleAlert,
} from "lucide-react";

import FinanceSummaryCard from "./FinanceSummaryCard";
import { formatCurrency } from "./financeUtils";

export default function FinanceSummaryCards({ summary = {} }) {
  const totalContracted = Number(
    summary.totalContracted ??
      summary.total_contracted ??
      summary.totalAmount ??
      0
  );

  const totalPaid = Number(
    summary.totalPaid ??
      summary.total_paid ??
      summary.paidAmount ??
      0
  );

  const totalPending = Number(
    summary.totalPending ??
      summary.total_pending ??
      summary.pendingAmount ??
      0
  );

  const totalOverdue = Number(
    summary.totalOverdue ??
      summary.total_overdue ??
      summary.overdueAmount ??
      0
  );

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">
          Resumo financeiro
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Visão geral dos valores vinculados aos seus cursos.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceSummaryCard
          label="Total contratado"
          value={formatCurrency(totalContracted)}
          icon={<ReceiptText size={20} />}
        />

        <FinanceSummaryCard
          label="Total pago"
          value={formatCurrency(totalPaid)}
          icon={<CircleDollarSign size={20} />}
          variant="success"
        />

        <FinanceSummaryCard
          label="Em aberto"
          value={formatCurrency(totalPending)}
          icon={<Clock3 size={20} />}
          variant="warning"
        />

        <FinanceSummaryCard
          label="Em atraso"
          value={formatCurrency(totalOverdue)}
          icon={<TriangleAlert size={20} />}
          variant={totalOverdue > 0 ? "danger" : "default"}
        />
      </div>
    </section>
  );
}