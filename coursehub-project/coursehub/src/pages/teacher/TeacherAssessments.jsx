import TeacherActivitiesPage from "../../components/teachers/TeacherActivitiesPage";

export default function TeacherAssessments() {
  return (
    <TeacherActivitiesPage
      activityKind="exam"
      pageTitle="Gerenciamento de avaliações"
      pageDescription="Crie, organize e acompanhe as avaliações dos seus cursos."
      createButtonText="+ Nova Avaliação"
      tableTitle="Lista de avaliações"
      emptyMessage="Nenhuma avaliação encontrada."
      createActionTitle="Cadastrar avaliação"
      createActionDescription="Crie uma nova avaliação para um dos seus cursos."
    />
  );
}