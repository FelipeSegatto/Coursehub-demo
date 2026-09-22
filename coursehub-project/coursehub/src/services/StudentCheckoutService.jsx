import { apiFetch } from "./APIService";

/** Compra autenticada de um novo curso pelo próprio aluno logado. */
export async function purchaseCourseAsAuthenticatedStudent(courseId, { pricingPlanId, paymentMethod, acceptance, cardToken, cardPaymentMethodId, cardInstallments }) {
  return apiFetch(`/api/student/finance/courses/${courseId}/checkout`, {
    method: "POST",
    body: JSON.stringify({
      pricingPlanId,
      paymentMethod,
      acceptance,
      cardToken,
      cardPaymentMethodId,
      cardInstallments,
    }),
  });
}
