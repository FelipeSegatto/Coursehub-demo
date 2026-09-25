import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Loader2, ShieldCheck, TriangleAlert } from "lucide-react";

import { useAuth } from "../../../auth/AuthContext";
import { API_URL } from "../../../services/APIService";
import { createCheckoutSession, submitCheckoutContract } from "../../../services/PublicCheckoutService";
import { CURRENT_TERMS_VERSION, CURRENT_PRIVACY_VERSION } from "../../../constants/legalVersions";

import CheckoutStepper from "../../../components/checkout/CheckoutStepper";
import CheckoutSummaryCard from "../../../components/checkout/CheckoutSummaryCard";

import Step1CoursePlan from "./steps/Step1CoursePlan";
import CheckoutEmailVerificationPending from "./CheckoutEmailVerificationPending";
import Step2Recipient from "./steps/Step2Recipient";
import Step3ContractingPartyData from "./steps/Step3ContractingPartyData";
import Step4ReviewAcceptance from "./steps/Step4ReviewAcceptance";
import Step5Payment from "./steps/Step5Payment";

const EMPTY_STUDENT = { name: "", email: "", birthDate: "", cpf: "", phone: "", address: "" };
const EMPTY_PARTY = { party_type: "individual", name: "", document_type: "cpf", document_number: "", email: "", phone: "", relationshipType: "" };

const STEP_LABELS = ["Plano", "Destinatário", "Dados", "Revisão", "Pagamento"];
const STEP_INDEX_BY_PHASE = {
  step1: 0,
  verifying: 0,
  step2: 1,
  step3: 2,
  step4: 3,
  step5: 4,
};

/**
 * Checkout público de curso -- visitante espontâneo, aluno novo ou
 * contratante externo. Se já estiver logado como aluno, redireciona
 * para a versão autenticada (StudentCoursePurchase.jsx), que não
 * precisa de verificação de e-mail nem de dados de contratante.
 */
export default function PublicCheckoutWizard() {
  const { courseId } = useParams();
  const [searchParams] = useSearchParams();
  const preselectedPlanId = searchParams.get("plan");
  const navigate = useNavigate();
  const { estaLogado, usuarioLogado } = useAuth();

  const [phase, setPhase] = useState("loading");
  const [loadError, setLoadError] = useState("");

  const [course, setCourse] = useState(null);
  const [plans, setPlans] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState(preselectedPlanId || null);

  const [checkoutToken, setCheckoutToken] = useState(null);
  const [checkoutEmail, setCheckoutEmail] = useState("");
  const [step1Error, setStep1Error] = useState("");
  const [step1Submitting, setStep1Submitting] = useState(false);

  const [recipientMode, setRecipientMode] = useState(null);
  const [studentCandidate, setStudentCandidate] = useState(EMPTY_STUDENT);
  const [contractingPartyData, setContractingPartyData] = useState(EMPTY_PARTY);
  const [accepted, setAccepted] = useState(false);

  const [selectedMethod, setSelectedMethod] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (estaLogado && usuarioLogado?.role === "student") {
      navigate(`/aluno/financeiro/comprar/${courseId}`, { replace: true });
    }
  }, [estaLogado, usuarioLogado, courseId, navigate]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [courseResponse, plansResponse] = await Promise.all([
          fetch(`${API_URL}/api/courses/${courseId}`),
          fetch(`${API_URL}/api/courses/${courseId}/pricing-plans`),
        ]);

        if (!courseResponse.ok) throw new Error("Não foi possível carregar o curso.");

        const courseData = await courseResponse.json();
        const plansData = plansResponse.ok ? await plansResponse.json() : [];

        if (cancelled) return;

        setCourse(courseData);
        setPlans(Array.isArray(plansData) ? plansData : []);
        setPhase("step1");
      } catch (error) {
        if (!cancelled) {
          setLoadError(error.message || "Não foi possível carregar o curso.");
          setPhase("error");
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const selectedPlan = plans.find((plan) => String(plan.id) === String(selectedPlanId)) || null;

  async function handleStep1Next(email) {
    setStep1Error("");

    try {
      setStep1Submitting(true);

      const result = await createCheckoutSession({ courseId, pricingPlanId: selectedPlanId, email });

      setCheckoutToken(result.data.checkoutToken);
      setCheckoutEmail(email);
      setStudentCandidate((current) => ({ ...current, email }));
      setPhase("verifying");
    } catch (error) {
      setStep1Error(error.message || "Não foi possível iniciar o checkout.");
    } finally {
      setStep1Submitting(false);
    }
  }

  function handleVerified() {
    setPhase("step2");
  }

  function handleRecipientNext() {
    if (recipientMode === "self") {
      setStudentCandidate((current) => ({ ...current, email: checkoutEmail }));
    } else {
      setContractingPartyData((current) => ({ ...current, email: checkoutEmail }));
    }
    setPhase("step3");
  }

  async function submitPurchase(paymentMethod, extra = {}) {
    setSubmitError("");

    try {
      setSubmitting(true);

      const result = await submitCheckoutContract(checkoutToken, {
        recipientMode,
        studentCandidate,
        contractingPartyData: recipientMode === "other" ? contractingPartyData : undefined,
        acceptance: { termsVersion: CURRENT_TERMS_VERSION, privacyVersion: CURRENT_PRIVACY_VERSION },
        paymentMethod,
        ...extra,
      });

      if (result.data.paymentInitError) {
        navigate(`/checkout/resultado?invoiceId=${result.data.invoiceId}&via=public&retry=1`);
        return;
      }

      navigate(
        `/checkout/processando?paymentId=${result.data.payment.paymentId}&invoiceId=${result.data.invoiceId}&via=public`
      );
    } catch (error) {
      setSubmitError(error.message || "Não foi possível concluir a contratação.");
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

  if (phase === "loading") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center sm:px-6">
        <Loader2 size={32} className="animate-spin text-slate-950" aria-hidden="true" />
        <p className="mt-4 text-sm text-slate-500">Carregando checkout...</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center sm:px-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
          <TriangleAlert size={26} aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-xl font-semibold tracking-tight text-slate-950">Não foi possível carregar o checkout</h1>
        <p className="mt-2 text-sm text-slate-500">{loadError}</p>
      </div>
    );
  }

  const currentStepIndex = STEP_INDEX_BY_PHASE[phase] ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
      <header>
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
          <ShieldCheck size={14} aria-hidden="true" />
          Checkout seguro
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Contratar curso</h1>
        <p className="mt-2 text-[15px] text-slate-500">{course.name}</p>
      </header>

      <div className="mt-8">
        <CheckoutStepper steps={STEP_LABELS} currentIndex={currentStepIndex} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px] lg:gap-8">
        <div className="order-2 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 lg:order-1">
          {phase === "step1" && (
            <Step1CoursePlan
              course={course}
              plans={plans}
              selectedPlanId={selectedPlanId}
              onSelectPlan={setSelectedPlanId}
              onNext={handleStep1Next}
              submitting={step1Submitting}
              error={step1Error}
            />
          )}

          {phase === "verifying" && (
            <CheckoutEmailVerificationPending checkoutToken={checkoutToken} email={checkoutEmail} onVerified={handleVerified} />
          )}

          {phase === "step2" && (
            <Step2Recipient
              recipientMode={recipientMode}
              onSelect={setRecipientMode}
              onNext={handleRecipientNext}
              onBack={() => setPhase("step1")}
            />
          )}

          {phase === "step3" && (
            <Step3ContractingPartyData
              recipientMode={recipientMode}
              studentCandidate={studentCandidate}
              onChangeStudent={setStudentCandidate}
              contractingPartyData={contractingPartyData}
              onChangeContractingParty={setContractingPartyData}
              onNext={() => setPhase("step4")}
              onBack={() => setPhase("step2")}
            />
          )}

          {phase === "step4" && selectedPlan && (
            <Step4ReviewAcceptance
              course={course}
              plan={selectedPlan}
              studentCandidate={studentCandidate}
              recipientMode={recipientMode}
              contractingPartyData={contractingPartyData}
              accepted={accepted}
              onToggleAccepted={() => setAccepted((current) => !current)}
              onNext={() => setPhase("step5")}
              onBack={() => setPhase("step3")}
            />
          )}

          {phase === "step5" && selectedPlan && (
            <Step5Payment
              plan={selectedPlan}
              acceptedMethods={{
                pix: selectedPlan.acceptsPix,
                boleto: selectedPlan.acceptsBoleto,
                creditCard: selectedPlan.acceptsCreditCard,
              }}
              selectedMethod={selectedMethod}
              onSelectMethod={handleSelectMethod}
              onCardToken={handleCardToken}
              submitting={submitting}
              error={submitError}
              onBack={() => setPhase("step4")}
            />
          )}
        </div>

        <div className="order-1 lg:order-2">
          <div className="lg:sticky lg:top-24">
            <CheckoutSummaryCard course={course} plan={selectedPlan} />
          </div>
        </div>
      </div>
    </div>
  );
}
