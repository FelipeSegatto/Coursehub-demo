import { QrCode, Barcode, CreditCard, Check } from "lucide-react";

const METHODS = [
  { key: "pix", label: "Pix", icon: QrCode },
  { key: "boleto", label: "Boleto", icon: Barcode },
  { key: "credit_card", label: "Cartão de crédito", icon: CreditCard },
];

/**
 * Seletor de forma de pagamento, compartilhado pelo checkout público,
 * pela compra autenticada de curso e pela página de pagamento privado
 * de invoice. `acceptedMethods` vem sempre do backend (plano
 * comercial/contrato), nunca inventado no frontend --
 * {pix, boleto, creditCard} booleanos.
 */
export default function PaymentMethodSelector({ acceptedMethods, selected, onSelect, disabled }) {
  const availableMethods = METHODS.filter((method) => {
    if (method.key === "credit_card") return acceptedMethods?.creditCard;
    return acceptedMethods?.[method.key];
  });

  if (availableMethods.length === 0) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
        Nenhuma forma de pagamento disponível para esta cobrança. Entre em contato com a instituição.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {availableMethods.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(key)}
          className={`relative flex flex-col items-center gap-2 rounded-xl border px-4 py-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
            selected === key
              ? "border-blue-600 bg-blue-50/60 text-blue-700 ring-1 ring-blue-600"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
          }`}
        >
          {selected === key && (
            <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-white">
              <Check size={10} strokeWidth={3} aria-hidden="true" />
            </span>
          )}
          <Icon size={22} aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
