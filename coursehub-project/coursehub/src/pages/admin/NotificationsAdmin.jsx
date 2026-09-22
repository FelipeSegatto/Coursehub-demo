import NotificationCenterPage from "../../components/notifications/NotificationCenterPage";
import { ADMIN_NOTIFICATION_CATEGORY_FILTERS } from "../../constants/notificationCategories";

export default function NotificationsAdmin() {
  return (
    <NotificationCenterPage
      title="Notificações"
      description="Avisos institucionais e eventos relevantes da plataforma."
      backLink="/admin/dashboard-admin"
      categories={ADMIN_NOTIFICATION_CATEGORY_FILTERS}
    />
  );
}
