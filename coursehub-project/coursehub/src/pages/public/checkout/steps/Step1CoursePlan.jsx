import { useState } from "react";
import { Check } from "lucide-react";

function formatCurrency(value) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const BILLING_TYPE_LABEL = {
  one_time: "Pagamento único",
  monthly_plan: "Plano mensal",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Etapa 1 -- curso e plano já vêm carregados pelo wizard; aqui se
 * escolhe o plano e se informa o e-mail que recebe a verificação
 * (ver spec: "seleciona curso/plano -> informa e-mail financeiro").
 * onNext(email) só é chamado com um e-mail válido.
 */
export default function Step1CoursePlan({ course, plans, selectedPlanId, onSelectPlan, onNext, submitting, error }) {
  const [email, setEmail] = useState("");
  const emailValid = EMAIL_PATTERN.test(email);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Etapa 1 de 5</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Escolha o plano</h2>
        <p className="mt-1 text-sm text-slate-500">Selecione como deseja pagar por {course.name}.</p>
      </div>

      <div className="space-y-3">
        {plans.map((plan) => {
          const isSelected = String(selectedPlanId) === String(plan.id);

          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => onSelectPlan(plan.id)}
              className={`flex w-full items-start gap-3 rounded-xl border px-4 py-4 text-left transition ${
                isSelected
                  ? "border-blue-600 bg-blue-50/60 ring-1 ring-blue-600"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
                  isSelected ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white"
                }`}
              >
                {isSelected && <Check size={12} className="text-white" strokeWidth={3} aria-hidden="true" />}
              </span>

              <span className="flex-1">
                <span className="block text-xs font-semibold uppercase text-blue-600">
                  {BILLING_TYPE_LABEL[plan.billingType] || plan.billingType}
                </span>
                <span className="mt-1 block font-semibold text-slate-950">{plan.name}</span>
                <span className="mt-1 block text-lg font-semibold tracking-tight text-slate-950">
                  {formatCurrency(plan.totalAmount)}
                </span>
                {plan.billingType === "monthly_plan" && plan.monthlyPaymentCount && (
                  <span className="block text-sm text-slate-500">
                    {plan.monthlyPaymentCount}x de {formatCurrency(plan.monthlyPaymentAmount)}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {selectedPlanId && (
        <div>
          <label htmlFor="checkout-email" className="mb-1.5 block text-sm font-medium text-slate-700">
            Seu e-mail
          </label>
          <input
            id="checkout-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="voce@exemplo.com"
            className="h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-[15px] text-slate-950 outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
          />
          <p className="mt-1.5 text-xs text-slate-400">
            Enviaremos um link de confirmação antes de continuar.
          </p>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={() => onNext(email)}
        disabled={!selectedPlanId || !emailValid || submitting}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-5 text-[15px] font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-600/20 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {submitting ? "Enviando..." : "Continuar"}
      </button>
    </div>
  );
}
