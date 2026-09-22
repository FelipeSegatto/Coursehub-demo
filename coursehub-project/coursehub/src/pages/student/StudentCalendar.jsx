import { useAuth } from "../../auth/AuthContext";
import CalendarPage from "../../components/calendar/CalendarPage";

export default function StudentCalendar() {
  const { usuarioLogado } = useAuth();

  return (
    <CalendarPage
      role="student"
      userId={usuarioLogado?.id}
      title="Calendário"
      description="Acompanhe prazos de atividades e avaliações, aulas e eventos acadêmicos."
    />
  );
}
