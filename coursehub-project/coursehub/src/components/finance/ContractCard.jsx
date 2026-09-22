import {
  CalendarDays,
  GraduationCap,
} from "lucide-react";

import {
  formatCurrency,
  formatDate,
  getContractStatusLabel,
} from "./financeUtils";
import DocumentDownloadButton from "../documents/DocumentDownloadButton";
import { getStudentContractDocumentEndpoints } from "../../services/DocumentGenerationService";

export default function ContractCard({ contract }) {
  const courseName =
    contract.courseName ||
    contract.course_name ||
    "Curso não informado";

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

  const installments =
    contract.monthlyPaymentCount ||
    contract.monthly_payment_count ||
    contract.installments ||
    contract.installmentCount ||
    contract.installment_count;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <GraduationCap size={21} />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="truncate font-semibold text-slate-900">
                {courseName}
              </h3>

              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                {getContractStatusLabel(contract.status)}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500">
              {startDate && (
                <span className="flex items-center gap-2">
                  <CalendarDays size={15} />
                  Contratado em {formatDate(startDate)}
                </span>
              )}

              

              {installments && (
                <span>
                  {installments}{" "}
                  {Number(installments) === 1
                    ? "parcela"
                    : "parcelas"}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 lg:text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Valor do contrato
          </p>

          <p className="mt-1 text-lg font-semibold text-slate-900">
            {formatCurrency(totalAmount)}
          </p>

          <div className="mt-3">
            <DocumentDownloadButton
              endpoints={getStudentContractDocumentEndpoints(contract.id)}
              label="contrato (PDF)"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            />
          </div>
        </div>
      </div>
    </article>
  );
}