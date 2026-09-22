import { apiFetch } from "./APIService";

export function getUserProfile() {
  return apiFetch("/api/profile/me");
}

export function updateUserProfile(profileData) {
  return apiFetch("/api/profile/me", {
    method: "PATCH",
    body: JSON.stringify(profileData),
  });
}

export function updateUserPassword(passwordData) {
  return apiFetch("/api/profile/me/password", {
    method: "PATCH",
    body: JSON.stringify(passwordData),
  });
}

export function updateUserAvatar(payload) {
  return apiFetch("/api/profile/me/avatar", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function uploadProfileAvatar(file) {
  const formData = new FormData();
  formData.append("file", file);

  return apiFetch("/api/profile/me/avatar", {
    method: "POST",
    body: formData,
  });
}

export function uploadUserFile(file, purpose) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("purpose", purpose);

  return apiFetch("/api/uploads", {
    method: "POST",
    body: formData,
  });
}