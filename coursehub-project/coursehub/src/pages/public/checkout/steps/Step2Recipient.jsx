import { User, Users } from "lucide-react";

/** Etapa 2 -- para quem é o curso? */
export default function Step2Recipient({ recipientMode, onSelect, onNext, onBack }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Etapa 2 de 5</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Para quem é o curso?</h2>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => onSelect("self")}
          className={`flex w-full items-start gap-3 rounded-xl border px-4 py-4 text-left transition ${
            recipientMode === "self"
              ? "border-slate-950 bg-slate-50 ring-1 ring-slate-950"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              recipientMode === "self" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-500"
            }`}
          >
            <User size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="font-semibold text-slate-950">O curso é para mim</p>
            <p className="text-sm text-slate-500">Você será o aluno e o contratante da cobrança.</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onSelect("other")}
          className={`flex w-full items-start gap-3 rounded-xl border px-4 py-4 text-left transition ${
            recipientMode === "other"
              ? "border-slate-950 bg-slate-50 ring-1 ring-slate-950"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              recipientMode === "other" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-500"
            }`}
          >
            <Users size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="font-semibold text-slate-950">O curso é para outra pessoa</p>
            <p className="text-sm text-slate-500">
              Você contrata como responsável/empresa; outra pessoa será o aluno.
            </p>
          </div>
        </button>
      </div>

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
          disabled={!recipientMode}
          className="h-12 flex-[2] rounded-xl bg-slate-950 px-5 text-[15px] font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-950/15 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
