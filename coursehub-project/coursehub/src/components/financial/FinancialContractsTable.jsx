import ContractStatusBadge from "./ContractStatusBadge";
import TableActionButton from "../ui/actions/TableActionButton";
import MobileExpandableCard from "../ui/MobileExpandableCard";

const BILLING_TYPE_LABELS = {
  one_time: "Pagamento único",
  installments: "Parcelado",
  monthly_plan: "Plano mensal",
};

function formatCurrency(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "R$ 0,00";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(numericValue);
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function getBillingTypeLabel(billingType) {
  return (
    BILLING_TYPE_LABELS[billingType] ||
    billingType ||
    "Não informado"
  );
}

function getInvoiceLabel(invoiceCount) {
  const count = Number(invoiceCount) || 0;

  return `${count} ${count === 1 ? "fatura" : "faturas"}`;
}

export default function FinancialContractsTable({
  contracts,
  onOpenContract,
}) {
  return (
    <>
    <div className="hidden overflow-x-auto md:block">
      <table className="min-w-[1280px] w-full border-collapse">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Contrato
            </th>

            <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Matrícula
            </th>

            <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Plano
            </th>

            <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Cobrança
            </th>

            <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Status
            </th>

            <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              Valor total
            </th>

            <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              Pago
            </th>

            <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              Pendente
            </th>

            <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              Em atraso
            </th>

            <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Próximo vencimento
            </th>

            <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100 bg-white">
          {contracts.map((contract) => {
            const hasOverdueAmount =
              Number(contract.overdueAmount) > 0;

            return (
              <tr
                key={contract.id}
                className={[
                  "transition-colors hover:bg-slate-50/80",
                  contract.status === "overdue"
                    ? "border-l-4 border-l-red-400"
                    : "border-l-4 border-l-transparent",
                ].join(" ")}
              >
                <td className="px-5 py-4">
                  <button
                    type="button"
                    onClick={() =>
                      onOpenContract(contract.id)
                    }
                    className="font-semibold text-blue-600 transition-colors hover:text-blue-800 hover:underline"
                  >
                    #{contract.id}
                  </button>
                </td>

                <td className="px-5 py-4 text-sm text-slate-600">
                  #{contract.enrollmentId}
                </td>

                <td className="px-5 py-4">
                  <div className="flex min-w-[180px] flex-col gap-1">
                    <span className="font-medium text-slate-900">
                      {contract.planName ||
                        "Plano não informado"}
                    </span>

                    <span className="text-xs text-slate-500">
                      {getInvoiceLabel(
                        contract.invoiceCount
                      )}
                    </span>
                  </div>
                </td>

                <td className="px-5 py-4 text-sm text-slate-600">
                  {getBillingTypeLabel(
                    contract.billingType
                  )}
                </td>

                <td className="px-5 py-4">
                  <ContractStatusBadge
                    status={contract.status}
                  />
                </td>

                <td className="whitespace-nowrap px-5 py-4 text-right text-sm font-medium tabular-nums text-slate-800">
                  {formatCurrency(contract.totalAmount)}
                </td>

                <td className="whitespace-nowrap px-5 py-4 text-right text-sm font-semibold tabular-nums text-emerald-700">
                  {formatCurrency(contract.paidAmount)}
                </td>

                <td className="whitespace-nowrap px-5 py-4 text-right text-sm tabular-nums text-slate-700">
                  {formatCurrency(contract.pendingAmount)}
                </td>

                <td
                  className={[
                    "whitespace-nowrap px-5 py-4 text-right",
                    "text-sm tabular-nums",
                    hasOverdueAmount
                      ? "font-semibold text-red-700"
                      : "text-slate-700",
                  ].join(" ")}
                >
                  {formatCurrency(contract.overdueAmount)}
                </td>

                <td className="whitespace-nowrap px-5 py-4 text-sm text-slate-600">
                  {formatDate(contract.nextDueDate)}
                </td>

                <td className="px-5 py-4 text-right">
                  <TableActionButton
                    variant="accent"
                    size="sm"
                    onClick={() => onOpenContract(contract.id)}
                  >
                    Detalhes
                  </TableActionButton>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

    <div className="space-y-3 md:hidden">
      {contracts.map((contract) => {
        const hasOverdueAmount = Number(contract.overdueAmount) > 0;

        return (
          <MobileExpandableCard
            key={contract.id}
            title={`Contrato #${contract.id} — ${contract.planName || "Plano não informado"}`}
            subtitle={`Matrícula #${contract.enrollmentId} · ${getInvoiceLabel(contract.invoiceCount)}`}
            badge={<ContractStatusBadge status={contract.status} />}
            primaryAction={
              <TableActionButton
                variant="accent"
                size="md"
                className="w-full"
                onClick={() => onOpenContract(contract.id)}
              >
                Detalhes
              </TableActionButton>
            }
          >
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Cobrança</span>
              <span className="font-medium text-slate-900">{getBillingTypeLabel(contract.billingType)}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Valor total</span>
              <span className="font-medium text-slate-900">{formatCurrency(contract.totalAmount)}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Pago</span>
              <span className="font-medium text-emerald-700">{formatCurrency(contract.paidAmount)}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Pendente</span>
              <span className="font-medium text-slate-900">{formatCurrency(contract.pendingAmount)}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Em atraso</span>
              <span className={`font-medium ${hasOverdueAmount ? "text-red-700" : "text-slate-900"}`}>
                {formatCurrency(contract.overdueAmount)}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Próximo vencimento</span>
              <span className="font-medium text-slate-900">{formatDate(contract.nextDueDate)}</span>
            </div>
          </MobileExpandableCard>
        );
      })}
    </div>
    </>
  );
}