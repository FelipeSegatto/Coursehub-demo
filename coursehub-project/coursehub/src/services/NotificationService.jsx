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

export async function listNotifications(params = {}) {
  const queryString = buildQueryString(params);

  return apiFetch(queryString ? `/api/notifications?${queryString}` : "/api/notifications");
}

export async function getUnreadNotificationCount() {
  return apiFetch("/api/notifications/unread-count");
}

export async function markNotificationRead(notificationId) {
  return apiFetch(`/api/notifications/${notificationId}/read`, { method: "PATCH" });
}

export async function markAllNotificationsRead() {
  return apiFetch("/api/notifications/read-all", { method: "PATCH" });
}

export async function archiveNotification(notificationId) {
  return apiFetch(`/api/notifications/${notificationId}/archive`, { method: "PATCH" });
}

export async function listNotificationPreferences() {
  return apiFetch("/api/notification-preferences");
}

export async function updateNotificationPreference(category, emailEnabled) {
  return apiFetch(`/api/notification-preferences/${category}`, {
    method: "PATCH",
    body: JSON.stringify({ emailEnabled }),
  });
}
