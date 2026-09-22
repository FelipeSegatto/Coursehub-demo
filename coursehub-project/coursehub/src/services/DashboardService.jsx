import { apiFetch } from "./APIService";

export async function getTeacherDashboard() {
  return apiFetch("/api/teacher/dashboard");
}

export async function getAdminDashboard() {
  return apiFetch("/api/admin/dashboard");
}
