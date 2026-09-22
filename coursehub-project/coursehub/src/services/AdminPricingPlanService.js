import { apiFetch } from "./APIService";

function buildQueryString(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    const shouldIgnore = value === undefined || value === null || value === "";

    if (!shouldIgnore) {
      query.append(key, String(value));
    }
  });

  return query.toString();
}

export async function listPricingPlans(params = {}) {
  const queryString = buildQueryString(params);

  return apiFetch(
    queryString
      ? `/api/admin/course-pricing-plans?${queryString}`
      : "/api/admin/course-pricing-plans"
  );
}

export async function getPricingPlanById(planId) {
  return apiFetch(`/api/admin/course-pricing-plans/${planId}`);
}

export async function createPricingPlan(payload) {
  return apiFetch("/api/admin/course-pricing-plans", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updatePricingPlan(planId, payload) {
  return apiFetch(`/api/admin/course-pricing-plans/${planId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function updatePricingPlanStatus(planId, status) {
  return apiFetch(`/api/admin/course-pricing-plans/${planId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function deletePricingPlan(planId) {
  return apiFetch(`/api/admin/course-pricing-plans/${planId}`, {
    method: "DELETE",
  });
}
