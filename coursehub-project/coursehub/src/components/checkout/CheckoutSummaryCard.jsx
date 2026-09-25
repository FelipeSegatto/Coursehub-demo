import { ShieldCheck } from "lucide-react";
import { publicImageUrl } from "../../utils/publicImageUrl";

function formatCurrency(value) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const BILLING_TYPE_LABEL = {
  one_time: "Pagamento único",
  monthly_plan: "Plano mensal",
};

/**
 * Resumo do pedido, fixo ao lado do formulário no checkout (público e
 * autenticado). Puramente apresentacional -- `plan` pode vir null
 * (etapa de seleção ainda não concluída), nesse caso mostra um estado
 * vazio em vez do preço.
 */
export default function CheckoutSummaryCard({ course, plan, className = "" }) {
  return (
    <aside className={`overflow-hidden rounded-2xl border border-slate-200 bg-white ${className}`}>
      <div className="aspect-[16/9] w-full overflow-hidden bg-slate-100">
        <img
          src={publicImageUrl(course?.image_url)}
          alt={course?.name || ""}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      </div>

      <div className="space-y-4 p-5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Resumo do pedido</p>
          <p className="mt-2 text-base font-semibold tracking-tight text-slate-950">{course?.name}</p>
        </div>

        {plan ? (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                  {BILLING_TYPE_LABEL[plan.billingType] || plan.billingType}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-slate-950">{plan.name}</p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3">
              <p className="text-[1.75rem] font-semibold tracking-tight text-slate-950 tabular-nums">
                {formatCurrency(plan.totalAmount)}
              </p>
              {plan.billingType === "monthly_plan" && plan.monthlyPaymentCount && (
                <p className="mt-0.5 text-sm text-slate-500">
                  {plan.monthlyPaymentCount}x de {formatCurrency(plan.monthlyPaymentAmount)}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-200 px-3 py-3 text-sm text-slate-400">
            Selecione um plano para ver o valor.
          </p>
        )}

        <div className="flex items-start gap-2 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-400">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
          Seus dados são protegidos e o pagamento é processado em ambiente seguro.
        </div>
      </div>
    </aside>
  );
}
