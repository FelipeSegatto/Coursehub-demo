import { useState } from "react";
import { Link2, Mail, MessageCircle, Check } from "lucide-react";

import { generateInvoicePaymentLink } from "../../services/FinancialService";

/**
 * "Enviar cobrança por e-mail" / "Copiar link de pagamento" /
 * "Copiar mensagem para WhatsApp" -- cada clique gera um link novo
 * (invalidando qualquer anterior) e, para copy_link/whatsapp_message,
 * copia o conteúdo direto para a área de transferência. O valor bruto
 * nunca fica em state por mais tempo que o necessário para mostrar a
 * confirmação -- é limpo logo em seguida, nunca persistido.
 */
export default function InvoicePaymentLinkMenu({ invoiceId }) {
  const [pending, setPending] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  async function handleAction(deliveryMethod, label) {
    setError("");
    setFeedback("");

    try {
      setPending(deliveryMethod);

      const result = await generateInvoicePaymentLink(invoiceId, { deliveryMethod });

      if (deliveryMethod === "email") {
        setFeedback(result.data.message || "Link enviado por e-mail.");
      } else {
        const textToCopy = deliveryMethod === "copy_link" ? result.data.paymentLinkUrl : result.data.message;

        try {
          await navigator.clipboard.writeText(textToCopy);
          setFeedback(`${label} copiado.`);
        } catch {
          setFeedback("Não foi possível copiar automaticamente. Tente novamente.");
        }
      }

      setTimeout(() => setFeedback(""), 3000);
    } catch (requestError) {
      setError(requestError.message || "Não foi possível gerar o link de pagamento.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => handleAction("copy_link", "Link")}
          disabled={Boolean(pending)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Link2 size={15} /> Copiar link de pagamento
        </button>

        <button
          type="button"
          onClick={() => handleAction("email", "E-mail")}
          disabled={Boolean(pending)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Mail size={15} /> Enviar por e-mail
        </button>

        <button
          type="button"
          onClick={() => handleAction("whatsapp_message", "Mensagem")}
          disabled={Boolean(pending)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <MessageCircle size={15} /> Copiar mensagem para WhatsApp
        </button>
      </div>

      {feedback && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
          <Check size={13} /> {feedback}
        </p>
      )}

      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
