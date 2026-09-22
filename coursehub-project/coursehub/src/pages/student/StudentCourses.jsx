import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import useEnrollment from "../../services/EnrollmentService";
import useStudentProgress from "../../services/StudentProgressService";
import { publicImageUrl } from "../../utils/publicImageUrl";

const ENROLLMENT_STATUS_LABEL = {
  active: "Matrícula ativa",
  pending: "Pendente",
  locked: "Trancada",
  cancelled: "Cancelada",
  completed: "Concluída",
};

function enrollmentLabel(status) {
  if (!status) return "Matrícula ativa";
  return ENROLLMENT_STATUS_LABEL[status] || status;
}

export default function StudentCourses() {
  const { usuarioLogado } = useAuth();

  const { matriculas, loading } = useEnrollment();
  const { overview } = useStudentProgress(usuarioLogado?.id);

  const progressByCourseId = new Map(
    (overview?.courses || []).map((course) => [
      Number(course.course_id),
      Number(course.content_progress?.progress_percentage || 0),
    ])
  );

  if (loading) {
    return <p className="p-6">Carregando...</p>;
  }

  if (!usuarioLogado) {
    return <p className="p-6">Usuário não encontrado.</p>;
  }

  return (
    <main className="bg-gray-50 px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <section className="mb-10">
          <p className="text-sm font-semibold text-blue-600">Área do aluno</p>

          <h1 className="mt-2 text-4xl font-bold text-gray-900">Meus cursos</h1>

          <p className="mt-3 max-w-2xl text-gray-600">
            Acesse seus cursos, continue de onde parou e acompanhe seu progresso.
          </p>
        </section>

        {matriculas.length === 0 && (
          <section className="rounded-2xl bg-white p-6 shadow">
            <p className="text-gray-600">Você ainda não está matriculado em nenhum curso.</p>
          </section>
        )}

        <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {matriculas.map((course) => {
            const progress = Math.min(
              100,
              Math.max(0, progressByCourseId.get(Number(course.id)) || 0)
            );

            return (
              <article
                key={course.id}
                className="group flex min-h-[300px] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg"
              >
                <div className="relative h-44 w-full overflow-hidden bg-slate-100">
                  <img
                    src={publicImageUrl(course.image_url)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                    onError={(event) => {
                      event.currentTarget.src = "/images/default-course.webp";
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-slate-950/10 to-transparent" />
                  <span className="absolute bottom-3 left-3 rounded-full border border-white/25 bg-slate-950/40 px-3 py-1 text-xs font-semibold text-white backdrop-blur-md">
                    {course.category || "Curso"}
                  </span>
                </div>

                <div className="flex flex-1 flex-col justify-between p-5">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-gray-900">
                      {course.name}
                    </h2>

                    {course.description && (
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-500">
                        {course.description}
                      </p>
                    )}
                  </div>

                  <div className="mt-6">
                    <div className="mb-3 flex items-center justify-between text-sm text-gray-500">
                      <span>{course.nivel || "Nível não informado"}</span>
                      <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                        {enrollmentLabel(course.enrollment_status)}
                      </span>
                    </div>

                    <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-2.5 rounded-full bg-blue-600 transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>

                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="text-gray-500">{Math.round(progress)}% concluído</span>

                      <Link
                        to={`/aluno/dashboard-aluno/courses/${course.id}`}
                        className="font-semibold text-blue-600 transition hover:text-blue-700"
                      >
                        Continuar
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
