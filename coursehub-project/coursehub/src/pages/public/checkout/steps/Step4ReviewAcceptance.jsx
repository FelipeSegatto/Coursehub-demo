import { Link } from "react-router-dom";

function formatCurrency(value) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Etapa 4 -- revisão dos dados + aceite explícito de Termos/Privacidade. */
export default function Step4ReviewAcceptance({
  course,
  plan,
  studentCandidate,
  recipientMode,
  contractingPartyData,
  accepted,
  onToggleAccepted,
  onNext,
  onBack,
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Etapa 4 de 5</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Revise seus dados</h2>
      </div>

      <dl className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Curso</dt>
          <dd className="text-right font-medium text-slate-950">{course.name}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Plano</dt>
          <dd className="text-right font-medium text-slate-950">{plan.name}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-slate-200 pt-3">
          <dt className="text-slate-500">Valor</dt>
          <dd className="text-right font-semibold text-slate-950">{formatCurrency(plan.totalAmount)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-slate-200 pt-3">
          <dt className="text-slate-500">Aluno</dt>
          <dd className="text-right font-medium text-slate-950">{studentCandidate.name}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Contratante</dt>
          <dd className="text-right font-medium text-slate-950">
            {recipientMode === "self" ? studentCandidate.name : contractingPartyData?.name}
          </dd>
        </div>
      </dl>

      <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 px-4 py-3.5 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={accepted}
          onChange={onToggleAccepted}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <span>
          Li e aceito os{" "}
          <Link to="/termos-de-uso" target="_blank" className="font-medium text-blue-600 underline underline-offset-2">
            Termos de Uso
          </Link>{" "}
          e a{" "}
          <Link to="/politica-de-privacidade" target="_blank" className="font-medium text-blue-600 underline underline-offset-2">
            Política de Privacidade
          </Link>
          .
        </span>
      </label>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="h-12 flex-1 rounded-xl border border-slate-300 px-5 text-[15px] font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!accepted}
          className="h-12 flex-[2] rounded-xl bg-blue-600 px-5 text-[15px] font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-600/20 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Continuar para pagamento
        </button>
      </div>
    </div>
  );
}
