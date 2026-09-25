import { useEffect, useState } from "react";

import { useAuth } from "../../auth/AuthContext";
import { apiFetch } from "../../services/APIService";
import { getTeacherCompletionEligibility } from "../../services/AcademicDocumentsService";

function readList(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[key])) return payload[key];
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export default function TeacherEligibility() {
  const { usuarioLogado } = useAuth();

  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [evaluation, setEvaluation] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!usuarioLogado?.id) return;

    apiFetch(`/api/teacher/by-user/${usuarioLogado.id}/classes`)
      .then((data) => setClasses(readList(data, "classes")))
      .catch(() => setClasses([]));
  }, [usuarioLogado?.id]);

  useEffect(() => {
    if (!usuarioLogado?.id || !selectedClassId) {
      setStudents([]);
      return;
    }

    apiFetch(`/api/teacher/by-user/${usuarioLogado.id}/classes/${selectedClassId}/students`)
      .then((data) => setStudents(readList(data, "students")))
      .catch(() => setStudents([]));

    setSelectedStudentId("");
    setEvaluation(null);
  }, [usuarioLogado?.id, selectedClassId]);

  async function checkEligibility() {
    if (!selectedClassId || !selectedStudentId) return;

    setLoading(true);
    setError("");
    setEvaluation(null);

    try {
      const { data } = await getTeacherCompletionEligibility(selectedClassId, selectedStudentId);
      setEvaluation(data);
    } catch (requestError) {
      setError(requestError.message || "Não foi possível avaliar a elegibilidade.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="p-6">
      <section className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Elegibilidade para Conclusão</h1>
        <p className="mt-2 text-gray-600">
          Consulte se um aluno das suas turmas cumpre os critérios para receber um certificado.
        </p>
      </section>

      <div className="max-w-xl space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="block text-sm font-medium text-slate-700">
          Turma
          <select
            value={selectedClassId}
            onChange={(event) => setSelectedClassId(event.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
          >
            <option value="">Selecione uma turma</option>
            {classes.map((classItem) => (
              <option key={classItem.id} value={classItem.id}>
                {classItem.name || classItem.course_name || `Turma #${classItem.id}`}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Aluno
          <select
            value={selectedStudentId}
            onChange={(event) => setSelectedStudentId(event.target.value)}
            disabled={!selectedClassId}
            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 disabled:bg-gray-100"
          >
            <option value="">Selecione um aluno</option>
            {students.map((student) => {
              const studentId = student.studentId || student.student_id || student.id;

              return (
                <option key={studentId} value={studentId}>
                  {student.name}
                </option>
              );
            })}
          </select>
        </label>

        <button
          type="button"
          onClick={checkEligibility}
          disabled={!selectedStudentId || loading}
          className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300"
        >
          {loading ? "Verificando..." : "Verificar elegibilidade"}
        </button>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {evaluation && (
          <div className="mt-4">
            <p
              className={`mb-3 inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                evaluation.eligible ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              }`}
            >
              {evaluation.eligible ? "Elegível para certificado" : "Ainda não elegível"}
            </p>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="pb-2">Critério</th>
                  <th className="pb-2">Exigido</th>
                  <th className="pb-2">Alcançado</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {evaluation.requirements.map((requirement) => (
                  <tr key={requirement.key} className="border-b border-slate-50">
                    <td className="py-2">{requirement.label}</td>
                    <td className="py-2">{String(requirement.required)}</td>
                    <td className="py-2">{requirement.actual === null ? "—" : String(requirement.actual)}</td>
                    <td className="py-2">
                      <span className={requirement.met ? "text-emerald-600" : "text-red-600"}>
                        {requirement.met ? "✓" : "✗"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
