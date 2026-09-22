/**
 * Central label mapping for notification categories. Do not spread
 * category → label strings across components -- NotificationItem's
 * category badge and the admin NotificationFilters both read from
 * here, so a label only ever needs to change in one place.
 *
 * category is a free-form string in the backend (notifications.category
 * VARCHAR(40), no DB/registry enum -- see notificationTypeRegistry.js),
 * not every value used across the whole app needs an entry here, only
 * the ones a UI actually surfaces as a filter/badge.
 */
export const NOTIFICATION_CATEGORY_LABELS = {
  registration: "Cadastros",
  enrollment: "Matrículas",
  financial: "Financeiro",
  request: "Requerimentos",
  contact: "Contatos",
  chat: "Chat",
  calendar: "Calendário",
  learning: "Acadêmico",
};

export function getNotificationCategoryLabel(category) {
  return NOTIFICATION_CATEGORY_LABELS[category] || category;
}

/**
 * Admin-specific category filter options for NotificationFilters.
 * Student/teacher inboxes don't pass a `categories` prop at all, so
 * they keep the plain status-only filter bar -- this list is only
 * ever used by NotificationsAdmin.jsx.
 */
export const ADMIN_NOTIFICATION_CATEGORY_FILTERS = [
  { value: "all", label: "Todas" },
  { value: "registration", label: NOTIFICATION_CATEGORY_LABELS.registration },
  { value: "enrollment", label: NOTIFICATION_CATEGORY_LABELS.enrollment },
  { value: "financial", label: NOTIFICATION_CATEGORY_LABELS.financial },
  { value: "request", label: NOTIFICATION_CATEGORY_LABELS.request },
  { value: "contact", label: NOTIFICATION_CATEGORY_LABELS.contact },
];
