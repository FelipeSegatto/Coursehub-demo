import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { confirmCheckoutEmailAutomatically } from "../../../services/PublicCheckoutService";

const MINIMUM_LOADING_MS = 2000;
const SUCCESS_PAUSE_MS = 1600;

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Na demo, a confirmação não depende do link em outra aba.
 * A tela fica carregando por cerca de dois segundos, mostra
 * o sucesso e só então libera o restante da compra.
 */
export default function CheckoutEmailVerificationPending({ checkoutToken, email, onVerified }) {
  const [phase, setPhase] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const onVerifiedRef = useRef(onVerified);

  useEffect(() => {
    onVerifiedRef.current = onVerified;
  }, [onVerified]);

  useEffect(() => {
    let cancelled = false;

    async function verify() {
      const startedAt = Date.now();

      try {
        await confirmCheckoutEmailAutomatically(checkoutToken);

        const elapsed = Date.now() - startedAt;
        await wait(Math.max(0, MINIMUM_LOADING_MS - elapsed));

        if (cancelled) return;

        setPhase("success");
        await wait(SUCCESS_PAUSE_MS);

        if (!cancelled) onVerifiedRef.current();
      } catch (error) {
        const elapsed = Date.now() - startedAt;
        await wait(Math.max(0, MINIMUM_LOADING_MS - elapsed));

        if (cancelled) return;

        setPhase("error");
        setErrorMessage(error.message || "Não foi possível verificar o e-mail.");
      }
    }

    verify();

    return () => {
      cancelled = true;
    };
  }, [checkoutToken]);

  return (
    <div className="space-y-4 py-4 text-center">
      <div
        className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
          phase === "success" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-950"
        }`}
      >
        {phase === "success" ? (
          <CheckCircle2 size={26} aria-hidden="true" />
        ) : (
          <Loader2 size={26} className="animate-spin" aria-hidden="true" />
        )}
      </div>

      {phase === "loading" && (
        <>
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">Verificando e-mail…</h2>
          <p className="text-sm text-slate-500">
            Estamos confirmando <strong className="font-medium text-slate-700">{email}</strong>.
          </p>
        </>
      )}

      {phase === "success" && (
        <h2 className="text-xl font-semibold tracking-tight text-slate-950">E-mail verificado com sucesso!</h2>
      )}

      {phase === "error" && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{errorMessage}</p>
      )}
    </div>
  );
}
