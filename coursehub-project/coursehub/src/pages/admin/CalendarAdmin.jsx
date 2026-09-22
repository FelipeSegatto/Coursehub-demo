import { useAuth } from "../../auth/AuthContext";
import CalendarPage from "../../components/calendar/CalendarPage";

export default function CalendarAdmin() {
  const { usuarioLogado } = useAuth();

  return (
    <CalendarPage
      role="admin"
      userId={usuarioLogado?.id}
      title="Calendário acadêmico"
      description="Gerencie feriados, recessos, matrículas, reuniões e demais eventos institucionais."
    />
  );
}
