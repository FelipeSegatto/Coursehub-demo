import InvoiceStatusBadge from "./InvoiceStatusBadge";
import TableActionButton from "../ui/actions/TableActionButton";
import MobileExpandableCard from "../ui/MobileExpandableCard";

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

  const normalizedValue =
    typeof value === "string"
      ? value.split("T")[0]
      : value;

  const date = new Date(
    `${normalizedValue}T00:00:00`
  );

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "pt-BR"
  ).format(date);
}

function getInstallmentLabel(invoice) {
  const installmentNumber = Number(
    invoice.installmentNumber ??
      invoice.installment_number
  );

  const totalInstallments = Number(
    invoice.totalInstallments ??
      invoice.total_installments
  );

  if (
    Number.isFinite(installmentNumber) &&
    Number.isFinite(totalInstallments)
  ) {
    return `${installmentNumber}/${totalInstallments}`;
  }

  if (Number.isFinite(installmentNumber)) {
    return String(installmentNumber);
  }

  return "—";
}

function getInvoiceAmount(invoice) {
  return (
    invoice.amount ??
    invoice.totalAmount ??
    invoice.total_amount ??
    0
  );
}

function getPaidAmount(invoice) {
  return (
    invoice.paidAmount ??
    invoice.paid_amount ??
    0
  );
}

function getRemainingAmount(invoice) {
  const explicitRemainingAmount =
    invoice.remainingAmount ??
    invoice.remaining_amount;

  if (
    explicitRemainingAmount !== undefined &&
    explicitRemainingAmount !== null
  ) {
    return Number(explicitRemainingAmount);
  }

  const amount = Number(
    getInvoiceAmount(invoice)
  );

  const paidAmount = Number(
    getPaidAmount(invoice)
  );

  if (
    !Number.isFinite(amount) ||
    !Number.isFinite(paidAmount)
  ) {
    return 0;
  }

  return Math.max(amount - paidAmount, 0);
}

function getContractId(invoice) {
  return (
    invoice.financialContractId ??
    invoice.financial_contract_id ??
    invoice.contractId ??
    invoice.contract_id
  );
}

function getEnrollmentId(invoice) {
  return (
    invoice.enrollmentId ??
    invoice.enrollment_id
  );
}

function getStudentName(invoice) {
  return (
    invoice.studentName ??
    invoice.student_name ??
    invoice.userName ??
    invoice.user_name ??
    "Aluno não informado"
  );
}

function getDueDate(invoice) {
  return (
    invoice.dueDate ??
    invoice.due_date
  );
}

function getPaidAt(invoice) {
  return (
    invoice.paidAt ??
    invoice.paid_at ??
    invoice.paymentDate ??
    invoice.payment_date
  );
}

export default function FinancialInvoicesTable({
  invoices = [],
  onOpenInvoice,
  onOpenContract,
}) {
  return (
    <>
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[1080px] border-collapse">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            <th className="px-2.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Fatura
            </th>

            <th className="px-2.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Contrato
            </th>

            <th className="px-2.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Aluno
            </th>

            <th className="px-2.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Matrícula
            </th>

            <th className="px-2.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Parcela
            </th>

            <th className="px-2.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Vencimento
            </th>

            <th className="px-2.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Status
            </th>

            <th className="px-2.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              Valor
            </th>

            <th className="px-2.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              Pago
            </th>

            <th className="px-2.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              Restante
            </th>

            <th className="px-2.5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Data do pagamento
            </th>

            <th className="px-2.5 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span className="sr-only">
                Ações
              </span>
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100 bg-white">
          {invoices.map((invoice) => {
            const contractId =
              getContractId(invoice);

            const enrollmentId =
              getEnrollmentId(invoice);

            const remainingAmount =
              getRemainingAmount(invoice);

            const isOverdue =
              invoice.status === "overdue";

            return (
              <tr
                key={invoice.id}
                className={[
                  "border-l-4 transition-colors",
                  "hover:bg-slate-50/80",
                  isOverdue
                    ? "border-l-red-400 bg-red-50/20"
                    : "border-l-transparent",
                ].join(" ")}
              >
                <td className="px-2.5 py-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      onOpenInvoice(invoice.id)
                    }
                    className={[
                      "font-semibold text-blue-600",
                      "transition-colors",
                      "hover:text-blue-800 hover:underline",
                      "focus:outline-none focus:underline",
                    ].join(" ")}
                  >
                    #{invoice.id}
                  </button>
                </td>

                <td className="px-2.5 py-2.5">
                  {contractId ? (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenContract(
                          contractId
                        )
                      }
                      className={[
                        "text-xs font-medium text-slate-700",
                        "transition-colors",
                        "hover:text-blue-700 hover:underline",
                      ].join(" ")}
                    >
                      #{contractId}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">
                      —
                    </span>
                  )}
                </td>

                <td className="px-2.5 py-2.5">
                  <div className="flex min-w-[140px] flex-col gap-1">
                    <span className="text-sm font-medium text-slate-900">
                      {getStudentName(invoice)}
                    </span>

                    {invoice.studentEmail ||
                    invoice.student_email ? (
                      <span className="text-xs text-slate-500">
                        {invoice.studentEmail ??
                          invoice.student_email}
                      </span>
                    ) : null}
                  </div>
                </td>

                <td className="px-2.5 py-2.5 text-xs text-slate-600">
                  {enrollmentId
                    ? `#${enrollmentId}`
                    : "—"}
                </td>

                <td className="px-2.5 py-2.5 text-xs text-slate-600">
                  {getInstallmentLabel(invoice)}
                </td>

                <td
                  className={[
                    "whitespace-nowrap px-2.5 py-2.5 text-xs",
                    isOverdue
                      ? "font-semibold text-red-700"
                      : "text-slate-600",
                  ].join(" ")}
                >
                  {formatDate(
                    getDueDate(invoice)
                  )}
                </td>

                <td className="px-2.5 py-2.5">
                  <InvoiceStatusBadge
                    status={invoice.status}
                  />
                </td>

                <td className="whitespace-nowrap px-2.5 py-2.5 text-right text-sm font-semibold tabular-nums text-slate-800">
                  {formatCurrency(
                    getInvoiceAmount(invoice)
                  )}
                </td>

                <td className="whitespace-nowrap px-2.5 py-2.5 text-right text-sm font-semibold tabular-nums text-emerald-700">
                  {formatCurrency(
                    getPaidAmount(invoice)
                  )}
                </td>

                <td
                  className={[
                    "whitespace-nowrap px-2.5 py-2.5",
                    "text-right text-sm tabular-nums",
                    remainingAmount > 0 &&
                    isOverdue
                      ? "font-semibold text-red-700"
                      : "text-slate-700",
                  ].join(" ")}
                >
                  {formatCurrency(
                    remainingAmount
                  )}
                </td>

                <td className="whitespace-nowrap px-2.5 py-2.5 text-xs text-slate-600">
                  {formatDate(
                    getPaidAt(invoice)
                  )}
                </td>

                <td className="px-2.5 py-2.5 text-right">
                  <TableActionButton
                    variant="accent"
                    size="xs"
                    onClick={() => onOpenInvoice(invoice.id)}
                    aria-label={`Ver detalhes da fatura ${invoice.id}`}
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
      {invoices.map((invoice) => {
        const contractId = getContractId(invoice);
        const enrollmentId = getEnrollmentId(invoice);
        const remainingAmount = getRemainingAmount(invoice);
        const isOverdue = invoice.status === "overdue";

        return (
          <MobileExpandableCard
            key={invoice.id}
            title={`Fatura #${invoice.id} — ${getStudentName(invoice)}`}
            subtitle={`Parcela ${getInstallmentLabel(invoice)} · Vence em ${formatDate(getDueDate(invoice))}`}
            badge={<InvoiceStatusBadge status={invoice.status} />}
            primaryAction={
              <TableActionButton
                variant="accent"
                size="md"
                className="w-full"
                onClick={() => onOpenInvoice(invoice.id)}
              >
                Detalhes
              </TableActionButton>
            }
          >
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Contrato</span>
              <span className="font-medium text-slate-900">{contractId ? `#${contractId}` : "—"}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Matrícula</span>
              <span className="font-medium text-slate-900">{enrollmentId ? `#${enrollmentId}` : "—"}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Vencimento</span>
              <span className={`font-medium ${isOverdue ? "text-red-700" : "text-slate-900"}`}>
                {formatDate(getDueDate(invoice))}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Valor</span>
              <span className="font-medium text-slate-900">{formatCurrency(getInvoiceAmount(invoice))}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Pago</span>
              <span className="font-medium text-emerald-700">{formatCurrency(getPaidAmount(invoice))}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Restante</span>
              <span className={`font-medium ${remainingAmount > 0 && isOverdue ? "text-red-700" : "text-slate-900"}`}>
                {formatCurrency(remainingAmount)}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Pagamento em</span>
              <span className="font-medium text-slate-900">{formatDate(getPaidAt(invoice))}</span>
            </div>
          </MobileExpandableCard>
        );
      })}
    </div>
    </>
  );
}