import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Receipt, ShieldCheck, AlertTriangle } from "lucide-react";

import {
  exchangeInvoicePaymentToken,
  getInvoicePaymentSnapshot,
  createPublicInvoicePayment,
  getPublicInvoicePayment,
} from "../../services/PublicInvoicePaymentService";
import PaymentMethodSelector from "../../components/payment/PaymentMethodSelector";
import PixPaymentPanel from "../../components/payment/PixPaymentPanel";
import BoletoPaymentPanel from "../../components/payment/BoletoPaymentPanel";
import CreditCardPaymentPanel from "../../components/payment/CreditCardPaymentPanel";

function formatCurrency(value) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(`${value}`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("pt-BR");
}

const STATE_LABEL = {
  overdue: "Cobrança vencida",
  cancelled: "Cobrança cancelada",
};

/**
 * Página pública restrita de pagamento de invoice
 * (/pagamento/fatura?token=...) -- usada por um contratante externo
 * (com ou sem conta CourseHub) para pagar uma cobrança específica sem
 * login. Segue o mesmo padrão de tokenState "checking/valid/invalid"
 * de ActivateAccount.jsx, mas com um passo a mais: troca o token por
 * uma sessão de cookie e remove o token da barra de endereço assim
 * que a troca é confirmada (history.replaceState), para reduzir a
 * exposição do token em histórico/referrer/logs de acesso.
 */
export default function InvoicePaymentLink() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [pageState, setPageState] = useState("loading");
  const [invoice, setInvoice] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [payment, setPayment] = useState(null);
  const [paymentError, setPaymentError] = useState("");
  const [starting, setStarting] = useState(false);

  // Reduz o quanto o token/sessão vaza via cabeçalho Referer para
  // qualquer link/recurso externo eventualmente carregado nesta
  // página.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.appendChild(meta);

    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadInvoice() {
      try {
        if (token) {
          await exchangeInvoicePaymentToken(token);

          if (cancelled) return;

          // Remove o token da URL assim que a troca é confirmada --
          // nunca fica salvo em histórico/favoritos/referrer a partir
          // daqui.
          window.history.replaceState(null, "", "/pagamento/fatura");
        }

        const result = await getInvoicePaymentSnapshot();

        if (cancelled) return;

        setInvoice(result.data);

        if (result.data.status === "paid") {
          setPageState("confirmed");
        } else if (result.data.status === "overdue") {
          setPageState("overdue");
        } else if (result.data.status === "cancelled" || result.data.status === "refunded") {
          setPageState("cancelled");
        } else {
          setPageState("available");
        }
      } catch {
        if (!cancelled) {
          setPageState("invalid-or-expired-link");
        }
      }
    }

    loadInvoice();

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSelectMethod(method) {
    setSelectedMethod(method);
    setPaymentError("");

    if (method === "credit_card") {
      // Cartão só cria a tentativa de pagamento depois que o Brick
      // tokeniza os dados no navegador (ver onCardToken abaixo) --
      // não existe "criar antes de ter o token" para este método.
      return;
    }

    try {
      setStarting(true);

      const result = await createPublicInvoicePayment(method);

      setPayment(result.data);
      setPageState("processing");
    } catch (requestError) {
      setPaymentError(requestError.message || "Não foi possível iniciar o pagamento.");
    } finally {
      setStarting(false);
    }
  }

  async function handleCardToken({ cardToken, cardPaymentMethodId, cardInstallments }) {
    setPaymentError("");

    try {
      setStarting(true);

      const result = await createPublicInvoicePayment("credit_card", {
        cardToken,
        cardPaymentMethodId,
        cardInstallments,
      });

      setPayment(result.data);
      setPageState("processing");
    } catch (requestError) {
      setPaymentError(requestError.message || "Não foi possível iniciar o pagamento.");
    } finally {
      setStarting(false);
    }
  }

  return (
  <main className="min-h-screen bg-slate-50">
    <section className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <Receipt size={22} aria-hidden="true" />
          </div>

          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
              Pagamento de cobrança
            </p>

            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
              Finalize seu pagamento
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Revise os dados e escolha a forma de pagamento.
            </p>
          </div>
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      {pageState === "loading" && (
        <p className="text-sm text-slate-500">
          Carregando cobrança...
        </p>
      )}

      {pageState === "invalid-or-expired-link" && (
        <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-red-50 p-6 text-sm leading-6 text-red-700">
          <div className="mb-2 flex items-center gap-2 font-semibold">
            <AlertTriangle size={18} />
            Link inválido ou expirado
          </div>

          Este link de pagamento não é mais válido.
          Solicite um novo link à instituição.
        </div>
      )}

      {invoice &&
        (pageState === "overdue" ||
          pageState === "cancelled") && (
          <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm leading-6 text-amber-700">
            {STATE_LABEL[pageState]}. Entre em
            contato com a instituição para
            regularizar.
          </div>
        )}

      {invoice &&
        pageState !== "loading" &&
        pageState !==
          "invalid-or-expired-link" &&
        pageState !== "overdue" &&
        pageState !== "cancelled" && (
          <div className="grid gap-8 lg:grid-cols-[1fr_380px] lg:items-start">
            {/* PAGAMENTO */}
            <div className="space-y-6">
              {pageState === "confirmed" && (
                <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-medium text-emerald-700">
                  <ShieldCheck size={20} />

                  Esta cobrança já foi paga.
                </div>
              )}

              {pageState === "available" && (
                <>
                  <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
                    <h2 className="text-lg font-semibold text-slate-950">
                      Forma de pagamento
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                      Escolha como deseja pagar esta cobrança.
                    </p>

                    <div className="mt-6">
                      <PaymentMethodSelector
                        acceptedMethods={
                          invoice.acceptedMethods
                        }
                        selected={
                          selectedMethod
                        }
                        onSelect={
                          handleSelectMethod
                        }
                        disabled={starting}
                      />
                    </div>
                  </div>

                  {selectedMethod ===
                    "credit_card" && (
                    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
                      <CreditCardPaymentPanel
                        amount={
                          invoice.amount
                        }
                        onToken={
                          handleCardToken
                        }
                        submitting={starting}
                      />
                    </div>
                  )}

                  {paymentError && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                      {paymentError}
                    </div>
                  )}
                </>
              )}

              {pageState === "processing" &&
                payment &&
                selectedMethod === "pix" && (
                  <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
                    <PixPaymentPanel
                      initialPayment={
                        payment
                      }
                      fetchPaymentFn={
                        getPublicInvoicePayment
                      }
                      onApproved={() =>
                        setPageState(
                          "confirmed"
                        )
                      }
                    />
                  </div>
                )}

              {pageState === "processing" &&
                payment &&
                selectedMethod ===
                  "boleto" && (
                  <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
                    <BoletoPaymentPanel
                      initialPayment={
                        payment
                      }
                      fetchPaymentFn={
                        getPublicInvoicePayment
                      }
                      onApproved={() =>
                        setPageState(
                          "confirmed"
                        )
                      }
                    />
                  </div>
                )}

              {pageState === "processing" &&
                payment &&
                selectedMethod ===
                  "credit_card" && (
                  <div className="rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-sm">
                    <p className="text-sm text-slate-500">
                      Processando pagamento com
                      cartão. Não feche esta
                      página.
                    </p>
                  </div>
                )}

              <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                <p className="text-sm leading-6 text-blue-900">
                  Por segurança, este link dá
                  acesso somente a esta
                  cobrança. Não encaminhe o
                  endereço para outras pessoas.
                </p>
              </div>
            </div>

            {/* RESUMO */}
            <aside className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm lg:sticky lg:top-28">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
                Resumo da cobrança
              </p>

              <h2 className="mt-3 text-xl font-semibold text-slate-950">
                {invoice.courseName}
              </h2>

              <dl className="mt-6 space-y-4 border-y border-slate-100 py-6">
                <div className="flex justify-between gap-6">
                  <dt className="text-sm text-slate-500">
                    Aluno
                  </dt>

                  <dd className="text-right text-sm font-medium text-slate-900">
                    {
                      invoice.studentDisplayName
                    }
                  </dd>
                </div>

                <div className="flex justify-between gap-6">
                  <dt className="text-sm text-slate-500">
                    Vencimento
                  </dt>

                  <dd className="text-right text-sm font-medium text-slate-900">
                    {formatDate(
                      invoice.dueDate
                    )}
                  </dd>
                </div>
              </dl>

              <div className="mt-6 flex items-end justify-between gap-4">
                <span className="text-sm text-slate-500">
                  Total
                </span>

                <strong className="text-2xl font-semibold tracking-tight text-slate-950">
                  {formatCurrency(
                    invoice.amount
                  )}
                </strong>
              </div>
            </aside>
          </div>
        )}
    </section>
  </main>
);
}