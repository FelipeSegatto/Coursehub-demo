import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, Check, Loader2, ShieldCheck } from "lucide-react";

import { API_URL } from "../../services/APIService";
import { purchaseCourseAsAuthenticatedStudent } from "../../services/StudentCheckoutService";
import { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from "../../constants/legalVersions";
import PaymentMethodSelector from "../../components/payment/PaymentMethodSelector";
import CreditCardPaymentPanel from "../../components/payment/CreditCardPaymentPanel";
import CheckoutSummaryCard from "../../components/checkout/CheckoutSummaryCard";

function formatCurrency(value) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Compra autenticada de um novo curso pelo próprio aluno logado
 * (/aluno/financeiro/comprar/:courseId?plan=). Diferente do checkout
 * público, não precisa de verificação de e-mail nem de dados de
 * contratante -- o aluno já está identificado pelo token, e o
 * contrato é sempre contractingPartyMode "self" (ver
 * authenticatedCheckoutService.js).
 */
export default function StudentCoursePurchase() {
  const { courseId } = useParams();
  const [searchParams] = useSearchParams();
  const preselectedPlanId = searchParams.get("plan");
  const navigate = useNavigate();

  const [course, setCourse] = useState(null);
  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(preselectedPlanId || null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [accepted, setAccepted] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setLoadError("");

        const [courseResponse, plansResponse] = await Promise.all([
          fetch(`${API_URL}/api/courses/${courseId}`),
          fetch(`${API_URL}/api/courses/${courseId}/pricing-plans`),
        ]);

        if (!courseResponse.ok) {
          throw new Error("Não foi possível carregar o curso.");
        }

        const courseData = await courseResponse.json();
        const plansData = plansResponse.ok ? await plansResponse.json() : [];

        if (cancelled) return;

        setCourse(courseData);
        setPlans(Array.isArray(plansData) ? plansData : []);

        if (!preselectedPlanId && Array.isArray(plansData) && plansData.length === 1) {
          setSelectedPlanId(plansData[0].id);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error.message || "Não foi possível carregar o curso.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [courseId, preselectedPlanId]);

  const selectedPlan = plans.find((plan) => String(plan.id) === String(selectedPlanId)) || null;

  const acceptedMethods = selectedPlan
    ? { pix: selectedPlan.acceptsPix, boleto: selectedPlan.acceptsBoleto, creditCard: selectedPlan.acceptsCreditCard }
    : { pix: false, boleto: false, creditCard: false };

  async function submitPurchase(paymentMethod, extra = {}) {
    setSubmitError("");

    if (!selectedPlan) {
      setSubmitError("Selecione um plano para continuar.");
      return;
    }

    if (!accepted) {
      setSubmitError("É necessário aceitar os Termos de Uso e a Política de Privacidade.");
      return;
    }

    try {
      setSubmitting(true);

      const result = await purchaseCourseAsAuthenticatedStudent(courseId, {
        pricingPlanId: selectedPlan.id,
        paymentMethod,
        acceptance: { termsVersion: CURRENT_TERMS_VERSION, privacyVersion: CURRENT_PRIVACY_VERSION },
        ...extra,
      });

      navigate(
        `/checkout/processando?paymentId=${result.data.payment.paymentId}&invoiceId=${result.data.invoiceId}&via=student`
      );
    } catch (error) {
      setSubmitError(error.message || "Não foi possível concluir a compra.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSelectMethod(method) {
    setSelectedMethod(method);
    setSubmitError("");

    if (method === "credit_card") return;

    submitPurchase(method);
  }

  function handleCardToken({ cardToken, cardPaymentMethodId, cardInstallments }) {
    submitPurchase("credit_card", { cardToken, cardPaymentMethodId, cardInstallments });
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center px-4 py-24 text-center">
        <Loader2 size={32} className="animate-spin text-slate-950" aria-hidden="true" />
        <p className="mt-4 text-sm text-slate-500">Carregando checkout...</p>
      </div>
    );
  }

  if (loadError || !course) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {loadError || "Curso não encontrado."}
      </p>
    );
  }

  return (
    <main className="mx-auto max-w-5xl pb-10">
      <Link
        to={`/courses/${courseId}`}
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-950"
      >
        <ArrowLeft size={16} /> Voltar para o curso
      </Link>

      <header>
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
          <ShieldCheck size={14} aria-hidden="true" />
          Checkout seguro
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Contratar {course.name}</h1>
      </header>

      {plans.length > 1 && !preselectedPlanId && (
        <div className="mt-8">
          <p className="mb-3 text-sm font-semibold text-slate-700">Escolha o plano</p>
          <div className="space-y-2">
            {plans.map((plan) => {
              const isSelected = String(selectedPlanId) === String(plan.id);

              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left text-sm transition ${
                    isSelected
                      ? "border-slate-950 bg-slate-50 ring-1 ring-slate-950"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      isSelected ? "border-slate-950 bg-slate-950" : "border-slate-300 bg-white"
                    }`}
                  >
                    {isSelected && <Check size={12} className="text-white" strokeWidth={3} aria-hidden="true" />}
                  </span>
                  <span className="font-semibold text-slate-950">{plan.name}</span>
                  <span className="text-slate-500">— {formatCurrency(plan.totalAmount)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedPlan && (
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px] lg:gap-8">
          <div className="order-2 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 lg:order-1">
            <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 px-4 py-3.5 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-slate-950 focus:ring-slate-950"
              />
              <span>
                Li e aceito os{" "}
                <Link to="/termos-de-uso" target="_blank" className="font-medium text-slate-950 underline underline-offset-2">
                  Termos de Uso
                </Link>{" "}
                e a{" "}
                <Link to="/politica-de-privacidade" target="_blank" className="font-medium text-slate-950 underline underline-offset-2">
                  Política de Privacidade
                </Link>
                .
              </span>
            </label>

            <div className="mt-6">
              <p className="mb-3 text-sm font-semibold text-slate-700">Forma de pagamento</p>

              <PaymentMethodSelector
                acceptedMethods={acceptedMethods}
                selected={selectedMethod}
                onSelect={handleSelectMethod}
                disabled={!accepted || submitting}
              />

              {selectedMethod === "credit_card" && (
                <div className="mt-4">
                  <CreditCardPaymentPanel amount={selectedPlan.totalAmount} onToken={handleCardToken} submitting={submitting} />
                </div>
              )}

              {submitError && (
                <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                  {submitError}
                </div>
              )}
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="lg:sticky lg:top-24">
              <CheckoutSummaryCard course={course} plan={selectedPlan} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
