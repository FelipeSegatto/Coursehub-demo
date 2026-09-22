import NotificationCenterPage from "../../components/notifications/NotificationCenterPage";

export default function StudentNotifications() {
  return (
    <NotificationCenterPage
      title="Notificações"
      description="Acompanhe avisos importantes sobre cursos, atividades, notas, frequência, financeiro e calendário."
      backLink="/aluno/dashboard-aluno"
    />
  );
}
