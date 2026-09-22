import StudentActivitiesList from "../../components/students/StudentActivitiesList";

export default function StudentActivities() {
  return (
    <StudentActivitiesList
      title="Minhas Atividades"
      description="Acompanhe tarefas pendentes, entregas, prazos e notas."
      listTitle="Lista de atividades"
      searchPlaceholder="Buscar atividade ou curso..."
      emptyMessage="Nenhuma atividade encontrada."
      actionPendingLabel="Realizar atividade"
      detailsPath="/aluno/atividades"
      activityKind="activity"
    />
  );
}