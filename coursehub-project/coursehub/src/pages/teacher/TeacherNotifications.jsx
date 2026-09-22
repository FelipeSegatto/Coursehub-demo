import NotificationCenterPage from "../../components/notifications/NotificationCenterPage";

export default function TeacherNotifications() {
  return (
    <NotificationCenterPage
      title="Notificações"
      description="Acompanhe dúvidas de alunos, envios recebidos e avisos institucionais."
      backLink="/professor/dashboard-professor"
    />
  );
}
