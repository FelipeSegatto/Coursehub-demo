import { useAuth } from "../../auth/AuthContext";
import CalendarPage from "../../components/calendar/CalendarPage";

export default function TeacherCalendar() {
  const { usuarioLogado } = useAuth();

  return (
    <CalendarPage
      role="teacher"
      userId={usuarioLogado?.id}
      title="Calendário"
      description="Prazos de correção, aulas das suas turmas e eventos acadêmicos."
    />
  );
}
