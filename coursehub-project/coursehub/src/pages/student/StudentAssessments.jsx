import StudentActivitiesList from "../../components/students/StudentActivitiesList";

export default function StudentAssessments() {
  return (
    <StudentActivitiesList
      title="Minhas Avaliações"
      description="Acompanhe provas, avaliações, prazos e resultados."
      listTitle="Lista de avaliações"
      searchPlaceholder="Buscar avaliação ou curso..."
      emptyMessage="Nenhuma avaliação encontrada."
      actionPendingLabel="Realizar avaliação"
      detailsPath="/aluno/avaliacoes"
      activityKind="exam"
    />
  );
}