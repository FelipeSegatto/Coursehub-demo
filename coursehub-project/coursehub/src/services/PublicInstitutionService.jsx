import { apiFetch } from "./APIService";

export async function getPublicInstitutionInfo() {
  return apiFetch("/api/public/institution");
}
