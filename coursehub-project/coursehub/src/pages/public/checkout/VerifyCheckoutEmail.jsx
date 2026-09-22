import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { MailCheck, AlertTriangle, CheckCircle2 } from "lucide-react";

import {
  validateCheckoutEmailToken,
  verifyCheckoutEmail,
} from "../../../services/PublicCheckoutService";

/**
 * /checkout/verificar-email -- mesmo padrão tokenState
 * "checking/valid/invalid" de ActivateAccount.jsx. Depois de
 * confirmado, instrui o usuário a voltar para a aba onde o wizard
 * ficou aguardando (a aba do wizard consulta GET /sessions/:token
 * periodicamente até status==='verified').
 */
export default function VerifyCheckoutEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [tokenState, setTokenState] = useState("checking");
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function checkToken() {
      if (!token) {
        setTokenState("invalid");
        return;
      }

      try {
        const result = await validateCheckoutEmailToken(token);

        if (!cancelled) {
          setTokenState(result?.valid ? "valid" : "invalid");
        }
      } catch {
        if (!cancelled) setTokenState("invalid");
      }
    }

    checkToken();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleConfirm() {
    setError("");

    try {
      setConfirming(true);

      await verifyCheckoutEmail(token);

      setConfirmed(true);
    } catch (confirmError) {
      setError(confirmError.message || "Não foi possível confirmar seu e-mail.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
        <MailCheck size={21} aria-hidden="true" />
      </div>

      <p className="mt-6 text-sm font-semibold text-blue-600">Confirmação de e-mail</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
        Confirme seu e-mail
      </h1>

      {tokenState === "checking" && (
        <p className="mt-7 text-sm text-slate-500">Verificando link...</p>
      )}

      {tokenState === "invalid" && (
        <div
          role="alert"
          className="mt-7 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          Este link de confirmação é inválido ou expirou. Volte à página do curso e inicie a
          contratação novamente.
        </div>
      )}

      {tokenState === "valid" && !confirmed && (
        <div className="mt-7 space-y-4">
          <p className="text-sm text-slate-500">
            Clique no botão abaixo para confirmar seu e-mail e continuar a contratação na aba onde
            você começou.
          </p>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirming}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-slate-950 px-5 text-[15px] font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {confirming ? "Confirmando..." : "Confirmar e-mail"}
          </button>

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      )}

      {confirmed && (
        <div className="mt-7 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-700">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          E-mail confirmado. Você já pode voltar para a aba onde iniciou a contratação e continuar.
        </div>
      )}

      <Link to="/" className="mt-8 inline-block text-sm font-medium text-slate-500 hover:text-slate-950">
        Voltar para o início
      </Link>
    </div>
  );
}
