import { apiFetch } from "./APIService";

export async function submitContactRequest(payload) {
  return apiFetch("/api/public/contact", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
