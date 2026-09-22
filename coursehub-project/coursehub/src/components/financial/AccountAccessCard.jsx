import { useState } from "react";
import { ShieldCheck, ShieldAlert, ShieldX, Send, Link2, Check } from "lucide-react";

import { createAccountActivationInvitation } from "../../services/AccountActivationService";

const STATUS_CONFIG = {
  active: { label: "Conta ativa", icon: ShieldCheck, className: "bg-emerald-50 text-emerald-700" },
  pending_activation: { label: "Aguardando ativação", icon: ShieldAlert, className: "bg-amber-50 text-amber-700" },
  blocked: { label: "Conta bloqueada", icon: ShieldX, className: "bg-red-50 text-red-700" },
  inactive: { label: "Conta inativa", icon: ShieldX, className: "bg-slate-100 text-slate-600" },
};

/**
 * Status da conta do aluno + reenviar convite / copiar link de
 * ativação -- reaproveita inteiramente o endpoint administrativo já
 * existente (POST /api/admin/users/:userId/account-activation-invitations),
 * sem backend novo. Só aparece quando o contrato tem um aluno com
 * conta vinculada (userId).
 */
export default function AccountAccessCard({ userId, accountStatus }) {
  const [pending, setPending] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  if (!userId) {
    return null;
  }

  const statusConfig = STATUS_CONFIG[accountStatus] || STATUS_CONFIG.inactive;
  const StatusIcon = statusConfig.icon;
  const canInvite = accountStatus === "pending_activation";

  async function handleAction(deliveryMethod) {
    setError("");
    setFeedback("");

    try {
      setPending(deliveryMethod);

      const result = await createAccountActivationInvitation(userId, deliveryMethod);

      if (deliveryMethod === "email") {
        setFeedback(result.message || "Convite enviado por e-mail.");
      } else {
        try {
          await navigator.clipboard.writeText(result.activationUrl);
          setFeedback("Link de ativação copiado.");
        } catch {
          setFeedback("Não foi possível copiar automaticamente. Tente novamente.");
        }
      }

      setTimeout(() => setFeedback(""), 3000);
    } catch (requestError) {
      setError(requestError.message || "Não foi possível processar o convite de ativação.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-semibold text-slate-900">Acesso ao sistema</h2>

      <div className={`flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${statusConfig.className}`}>
        <StatusIcon size={15} /> {statusConfig.label}
      </div>

      {canInvite && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleAction("email")}
            disabled={Boolean(pending)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Send size={15} /> Reenviar convite
          </button>

          <button
            type="button"
            onClick={() => handleAction("manual_link")}
            disabled={Boolean(pending)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Link2 size={15} /> Copiar link de ativação
          </button>
        </div>
      )}

      {feedback && (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
          <Check size={13} /> {feedback}
        </p>
      )}

      {error && <p className="mt-2 text-xs font-medium text-red-600">{error}</p>}
    </section>
  );
}
