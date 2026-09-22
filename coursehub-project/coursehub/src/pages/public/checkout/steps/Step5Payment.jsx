import PaymentMethodSelector from "../../../../components/payment/PaymentMethodSelector";
import CreditCardPaymentPanel from "../../../../components/payment/CreditCardPaymentPanel";

/**
 * Etapa 5 -- escolha do método e submissão final. Pix/boleto disparam
 * a submissão direto; cartão só submete depois que o Brick tokeniza
 * (onCardToken).
 */
export default function Step5Payment({
  plan,
  acceptedMethods,
  selectedMethod,
  onSelectMethod,
  onCardToken,
  submitting,
  error,
  onBack,
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Etapa 5 de 5</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Forma de pagamento</h2>
      </div>

      <PaymentMethodSelector
        acceptedMethods={acceptedMethods}
        selected={selectedMethod}
        onSelect={onSelectMethod}
        disabled={submitting}
      />

      {selectedMethod === "credit_card" && (
        <CreditCardPaymentPanel amount={plan.totalAmount} onToken={onCardToken} submitting={submitting} />
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={onBack}
        disabled={submitting}
        className="h-12 w-full rounded-xl border border-slate-300 px-5 text-[15px] font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed"
      >
        Voltar
      </button>
    </div>
  );
}
