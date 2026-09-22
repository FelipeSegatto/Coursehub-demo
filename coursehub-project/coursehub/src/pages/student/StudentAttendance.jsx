import { useEffect, useState } from "react";
import { apiFetch } from "../../services/APIService";

const STATUS_LABEL = {
  present: "Presente",
  absent: "Falta",
  late: "Atraso",
  excused: "Justificada",
};

export default function StudentAttendance() {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    apiFetch("/api/students/me/attendance")
      .then((data) => {
        if (!cancelled) setPayload(data);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError.message || "Não foi possível carregar a frequência.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="p-6">Carregando frequência...</p>;
  }

  if (error) {
    return <p className="p-6 text-red-600">{error}</p>;
  }

  const courses = payload?.courses || [];

  return (
    <main className="bg-gray-50 px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-4xl font-bold text-gray-900">Frequência</h1>
        <p className="mt-3 max-w-2xl text-gray-600">
          Acompanhe sua presença nas turmas em que você está matriculado.
        </p>

        {courses.length === 0 ? (
          <section className="mt-8 rounded-2xl bg-white p-6 shadow">
            <p className="text-gray-600">Nenhuma matrícula encontrada.</p>
          </section>
        ) : (
          <div className="mt-8 space-y-6">
            {courses.map((course) => (
              <section
                key={course.enrollmentId}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <h2 className="text-xl font-bold text-gray-900">{course.courseName}</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {course.className ? `Turma ${course.className}` : "Sem turma atribuída"}
                </p>

                {course.summary ? (
                  <p className="mt-3 text-sm text-gray-700">
                    {course.summary.present} presenças · {course.summary.absent} faltas ·{" "}
                    {course.summary.late} atrasos · {course.summary.excused} justificadas
                    {course.summary.attendanceRate != null
                      ? ` · ${course.summary.attendanceRate}% de presença`
                      : ""}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-gray-500">
                    Frequência só é lançada depois que a matrícula tem uma turma.
                  </p>
                )}

                {course.sessions.length > 0 && (
                  <table className="mt-4 w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                        <th className="pb-2">Encontro</th>
                        <th className="pb-2">Data</th>
                        <th className="pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {course.sessions.map((session) => (
                        <tr key={session.session_id} className="border-b border-slate-50">
                          <td className="py-2">{session.title || "Encontro"}</td>
                          <td className="py-2">{session.session_date || "—"}</td>
                          <td className="py-2">
                            {STATUS_LABEL[session.attendance_status] || "Não lançado"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}