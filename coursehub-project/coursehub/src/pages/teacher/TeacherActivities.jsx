import TeacherActivitiesPage from "../../components/teachers/TeacherActivitiesPage";

export default function TeacherActivities() {
  return (
    <TeacherActivitiesPage
      activityKind="activity"
      pageTitle="Gerenciamento de atividades"
      pageDescription="Crie, organize e acompanhe as atividades dos seus cursos."
      createButtonText="+ Nova Atividade"
      tableTitle="Lista de atividades"
      emptyMessage="Nenhuma atividade encontrada."
      createActionTitle="Cadastrar atividade"
      createActionDescription="Crie uma nova atividade para um dos seus cursos."
    />
  );
}